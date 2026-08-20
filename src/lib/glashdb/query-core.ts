/* eslint-disable @typescript-eslint/no-explicit-any */
export type GlashQueryAction = "select" | "insert" | "update" | "delete" | "upsert" | "rpc";

export type GlashFilter =
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "ilike"; column: string; value: any }
  | { op: "in"; column: string; value: any[] }
  | { op: "is"; column: string; value: any };

export interface GlashQueryPayload {
  table?: string;
  fn?: string;
  action: GlashQueryAction;
  columns?: string;
  payload?: any;
  options?: Record<string, any>;
  filters?: GlashFilter[];
  orFilters?: string[];
  orders?: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }>;
  limit?: number | null;
  offset?: number | null;
  resultMode?: "many" | "single" | "maybeSingle";
}

export interface GlashQueryResult<T = any> {
  data: T | null;
  error: { message: string; details?: string | null; code?: string | null } | null;
  count?: number | null;
}

export type GlashQueryExecutor = (payload: GlashQueryPayload) => Promise<GlashQueryResult>;

export class GlashQueryBuilder<T = any> implements PromiseLike<GlashQueryResult<T>> {
  private payload: GlashQueryPayload;

  constructor(
    private readonly executePayload: GlashQueryExecutor,
    tableOrPayload: string | GlashQueryPayload,
  ) {
    this.payload = typeof tableOrPayload === "string"
      ? { table: tableOrPayload, action: "select", filters: [], orFilters: [], orders: [] }
      : { filters: [], orFilters: [], orders: [], ...tableOrPayload };
  }

  select(columns = "*", options?: Record<string, any>) {
    this.payload.action = this.payload.action === "insert" || this.payload.action === "update" || this.payload.action === "upsert"
      ? this.payload.action
      : "select";
    this.payload.columns = columns || "*";
    this.payload.options = { ...(this.payload.options || {}), ...(options || {}) };
    return this;
  }

  insert(payload: any, options?: Record<string, any>) {
    this.payload.action = "insert";
    this.payload.payload = payload;
    this.payload.options = { ...(this.payload.options || {}), ...(options || {}) };
    return this;
  }

  update(payload: any, options?: Record<string, any>) {
    this.payload.action = "update";
    this.payload.payload = payload;
    this.payload.options = { ...(this.payload.options || {}), ...(options || {}) };
    return this;
  }

  delete(options?: Record<string, any>) {
    this.payload.action = "delete";
    this.payload.options = { ...(this.payload.options || {}), ...(options || {}) };
    return this;
  }

  upsert(payload: any, options?: Record<string, any>) {
    this.payload.action = "upsert";
    this.payload.payload = payload;
    this.payload.options = { ...(this.payload.options || {}), ...(options || {}) };
    return this;
  }

  eq(column: string, value: any) { return this.addFilter({ op: "eq", column, value }); }
  neq(column: string, value: any) { return this.addFilter({ op: "neq", column, value }); }
  gt(column: string, value: any) { return this.addFilter({ op: "gt", column, value }); }
  gte(column: string, value: any) { return this.addFilter({ op: "gte", column, value }); }
  lt(column: string, value: any) { return this.addFilter({ op: "lt", column, value }); }
  lte(column: string, value: any) { return this.addFilter({ op: "lte", column, value }); }
  ilike(column: string, value: any) { return this.addFilter({ op: "ilike", column, value }); }
  in(column: string, value: any[]) { return this.addFilter({ op: "in", column, value }); }
  is(column: string, value: any) { return this.addFilter({ op: "is", column, value }); }

  match(values: Record<string, any>) {
    for (const [column, value] of Object.entries(values || {})) this.eq(column, value);
    return this;
  }

  or(filter: string) {
    this.payload.orFilters = [...(this.payload.orFilters || []), filter];
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.payload.orders = [
      ...(this.payload.orders || []),
      { column, ascending: options?.ascending !== false, nullsFirst: options?.nullsFirst },
    ];
    return this;
  }

  limit(value: number) {
    this.payload.limit = Math.max(0, Number(value) || 0);
    return this;
  }

  range(from: number, to: number) {
    const start = Math.max(0, Number(from) || 0);
    const end = Math.max(start, Number(to) || start);
    this.payload.offset = start;
    this.payload.limit = end - start + 1;
    return this;
  }

  single() {
    this.payload.resultMode = "single";
    this.payload.limit = this.payload.limit ?? 1;
    return this;
  }

  maybeSingle() {
    this.payload.resultMode = "maybeSingle";
    this.payload.limit = this.payload.limit ?? 1;
    return this;
  }

  async execute(): Promise<GlashQueryResult<T>> {
    return this.executePayload(this.payload) as Promise<GlashQueryResult<T>>;
  }

  then<TResult1 = GlashQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: GlashQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private addFilter(filter: GlashFilter) {
    this.payload.filters = [...(this.payload.filters || []), filter];
    return this;
  }
}

export function createGlashQueryClient<
  TExtras extends Record<string, any> = Record<string, never>,
>(executePayload: GlashQueryExecutor, extras: TExtras = {} as TExtras) {
  return {
    ...extras,
    from(table: string) {
      return new GlashQueryBuilder(executePayload, table);
    },
    rpc(fn: string, args?: Record<string, any>) {
      return new GlashQueryBuilder(executePayload, { action: "rpc", fn, payload: args || {} });
    },
  };
}
