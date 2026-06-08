/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createGlashQueryClient,
  type GlashFilter,
  type GlashQueryPayload,
  type GlashQueryResult,
} from "@/lib/glashdb/query-core";
import { glashQuery } from "@/lib/glashdb/postgres";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(value: string) {
  const parts = String(value).split(".");
  return parts.map((part) => {
    if (!IDENT.test(part)) throw new Error(`Unsafe SQL identifier: ${value}`);
    return `"${part}"`;
  }).join(".");
}

function quoteTable(value: string) {
  if (!IDENT.test(value)) throw new Error(`Unsafe table name: ${value}`);
  return `public."${value}"`;
}

function splitTopLevel(input: string, separator = ",") {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === separator && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function selectSql(columns?: string) {
  const raw = (columns || "*").trim();
  if (!raw || raw === "*") return "*";
  if (raw === "count") return "count(*)::int as count";
  if (raw.includes("(") || raw.includes("!") || raw.includes(":")) {
    // PostgREST relationship projections are not SQL projections. Returning
    // the base row preserves the database read without pretending nested
    // expansion happened.
    return "*";
  }
  return splitTopLevel(raw).map((column) => {
    const aliasMatch = column.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (aliasMatch) return `${quoteIdent(aliasMatch[2])} as ${quoteIdent(aliasMatch[1])}`;
    return quoteIdent(column);
  }).join(", ");
}

function pushParam(params: any[], value: any) {
  params.push(value);
  return `$${params.length}`;
}

function filterSql(filter: GlashFilter, params: any[]) {
  const column = quoteIdent(filter.column);
  if (filter.op === "eq") {
    if (filter.value === null) return `${column} is null`;
    return `${column} = ${pushParam(params, filter.value)}`;
  }
  if (filter.op === "neq") {
    if (filter.value === null) return `${column} is not null`;
    return `${column} <> ${pushParam(params, filter.value)}`;
  }
  if (filter.op === "in") {
    const values = Array.isArray(filter.value) ? filter.value : [];
    if (values.length === 0) return "false";
    return `${column} = any(${pushParam(params, values)})`;
  }
  if (filter.op === "is") {
    if (filter.value === null) return `${column} is null`;
    if (filter.value === true) return `${column} is true`;
    if (filter.value === false) return `${column} is false`;
    return `${column} is ${String(filter.value)}`;
  }
  const opMap = { gt: ">", gte: ">=", lt: "<", lte: "<=", ilike: "ilike" } as const;
  return `${column} ${opMap[filter.op]} ${pushParam(params, filter.value)}`;
}

function parseLiteral(value: string) {
  const raw = value.trim();
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function parsePostgrestCondition(condition: string, params: any[]): string {
  const andMatch = condition.match(/^and\((.*)\)$/);
  if (andMatch) {
    return `(${splitTopLevel(andMatch[1]).map((part) => parsePostgrestCondition(part, params)).join(" and ")})`;
  }

  const match = condition.match(/^([a-zA-Z_][a-zA-Z0-9_]*?)\.(eq|neq|gt|gte|lt|lte|ilike|is|in)\.(.*)$/);
  if (!match) throw new Error(`Unsupported OR filter: ${condition}`);
  const [, column, op, value] = match;
  if (op === "in") {
    const list = value.replace(/^\(/, "").replace(/\)$/, "");
    return filterSql({ op: "in", column, value: splitTopLevel(list).map(parseLiteral) }, params);
  }
  return filterSql({ op: op as any, column, value: parseLiteral(value) }, params);
}

function whereSql(payload: GlashQueryPayload, params: any[]) {
  const parts = [
    ...(payload.filters || []).map((filter) => filterSql(filter, params)),
    ...(payload.orFilters || []).map((filter) => {
      const clauses = splitTopLevel(filter).map((part) => parsePostgrestCondition(part, params));
      return `(${clauses.join(" or ")})`;
    }),
  ];
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

function orderLimitSql(payload: GlashQueryPayload, params: any[]) {
  const order = (payload.orders || []).length
    ? ` order by ${(payload.orders || []).map((item) => {
      const nulls = item.nullsFirst === undefined ? "" : item.nullsFirst ? " nulls first" : " nulls last";
      return `${quoteIdent(item.column)} ${item.ascending === false ? "desc" : "asc"}${nulls}`;
    }).join(", ")}`
    : "";
  const limit = payload.limit == null ? "" : ` limit ${pushParam(params, payload.limit)}`;
  const offset = payload.offset == null ? "" : ` offset ${pushParam(params, payload.offset)}`;
  return `${order}${limit}${offset}`;
}

function mutationColumns(rows: any[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
}

function normalizeRows(payload: any) {
  return Array.isArray(payload) ? payload : [payload];
}

function returnResult(rows: any[], payload: GlashQueryPayload): GlashQueryResult {
  if (payload.resultMode === "single") {
    if (rows.length !== 1) return { data: null, error: { message: `Expected single row, received ${rows.length}.` } };
    return { data: rows[0], error: null };
  }
  if (payload.resultMode === "maybeSingle") {
    if (rows.length > 1) return { data: null, error: { message: `Expected maybeSingle row, received ${rows.length}.` } };
    return { data: rows[0] ?? null, error: null };
  }
  return { data: rows, error: null };
}

export async function executeGlashQueryPayload(payload: GlashQueryPayload): Promise<GlashQueryResult> {
  try {
    const params: any[] = [];
    let sql = "";

    if (payload.action === "rpc") {
      if (!payload.fn || !IDENT.test(payload.fn)) throw new Error("Unsafe function name.");
      const args = payload.payload && typeof payload.payload === "object" ? payload.payload : {};
      const values = Object.values(args);
      const placeholders = values.map((value) => pushParam(params, value)).join(", ");
      sql = `select * from public."${payload.fn}"(${placeholders})`;
      const rows = await glashQuery(sql, params);
      return returnResult(rows, payload);
    }

    if (!payload.table) throw new Error("Missing table.");
    const table = quoteTable(payload.table);
    const where = () => whereSql(payload, params);
    const suffix = () => orderLimitSql(payload, params);

    if (payload.action === "select") {
      if (payload.options?.count || payload.options?.head) {
        const countParams: any[] = [];
        const countRows = await glashQuery<{ count: number }>(
          `select count(*)::int as count from ${table}${whereSql(payload, countParams)}`,
          countParams,
        );
        const count = Number(countRows[0]?.count || 0);
        if (payload.options?.head) return { data: null, error: null, count };
        sql = `select ${selectSql(payload.columns)} from ${table}${where()}${suffix()}`;
        const rows = await glashQuery(sql, params);
        return { ...returnResult(rows, payload), count };
      }
      sql = `select ${selectSql(payload.columns)} from ${table}${where()}${suffix()}`;
      const rows = await glashQuery(sql, params);
      return returnResult(rows, payload);
    }

    if (payload.action === "insert" || payload.action === "upsert") {
      const rows = normalizeRows(payload.payload).filter(Boolean);
      if (!rows.length) return { data: [], error: null };
      const columns = mutationColumns(rows);
      const valuesSql = rows.map((row) => `(${columns.map((column) => pushParam(params, row[column] ?? null)).join(", ")})`).join(", ");
      const conflict = String(payload.options?.onConflict || "").split(",").map((item) => item.trim()).filter(Boolean);
      const conflictSql = payload.action === "upsert" && conflict.length
        ? ` on conflict (${conflict.map(quoteIdent).join(", ")}) do update set ${columns
          .filter((column) => !conflict.includes(column))
          .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
          .join(", ")}`
        : "";
      sql = `insert into ${table} (${columns.map(quoteIdent).join(", ")}) values ${valuesSql}${conflictSql} returning ${selectSql(payload.columns)}`;
      const result = await glashQuery(sql, params);
      return returnResult(result, payload);
    }

    if (payload.action === "update") {
      const patch = payload.payload || {};
      const columns = Object.keys(patch);
      if (!columns.length) return { data: [], error: null };
      const setSql = columns.map((column) => `${quoteIdent(column)} = ${pushParam(params, patch[column])}`).join(", ");
      sql = `update ${table} set ${setSql}${where()} returning ${selectSql(payload.columns)}`;
      const rows = await glashQuery(sql, params);
      return returnResult(rows, payload);
    }

    if (payload.action === "delete") {
      sql = `delete from ${table}${where()} returning ${selectSql(payload.columns)}`;
      const rows = await glashQuery(sql, params);
      return returnResult(rows, payload);
    }

    return { data: null, error: { message: `Unsupported Glash query action: ${payload.action}` } };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Glash query failed.",
      },
    };
  }
}

export function createGlashServerQueryClient(extras: Record<string, any> = {}) {
  return createGlashQueryClient(executeGlashQueryPayload, extras);
}
