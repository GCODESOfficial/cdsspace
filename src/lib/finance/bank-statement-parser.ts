import "server-only";

import JSZip from "jszip";

export interface ParsedBankTransaction {
  date: string;
  description: string;
  reference: string | null;
  type: "credit" | "debit";
  amount: number;
  balance: number | null;
  raw: Record<string, string>;
}

export interface ParsedBankStatement {
  transactions: ParsedBankTransaction[];
  periodStart: string;
  periodEnd: string;
  totalCredit: number;
  totalDebit: number;
  warnings: string[];
}

const HEADER_ALIASES = {
  date: ["date", "transaction date", "txn date", "posting date", "posted date", "value date"],
  description: ["description", "details", "narration", "transaction details", "remarks", "memo", "particulars"],
  reference: ["reference", "ref", "transaction reference", "session id", "transaction id", "id"],
  credit: ["credit", "credits", "deposit", "deposits", "inflow", "paid in", "money in"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "outflow", "paid out", "money out"],
  amount: ["amount", "transaction amount", "value"],
  type: ["type", "transaction type", "dr cr", "debit credit", "direction"],
  balance: ["balance", "running balance", "available balance", "closing balance"],
} as const;

type HeaderKey = keyof typeof HEADER_ALIASES;

function cleanCell(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedHeader(value: unknown) {
  return cleanCell(value).toLowerCase().replace(/[._/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function headerKind(value: unknown): HeaderKey | null {
  const normalized = normalizedHeader(value);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[HeaderKey, readonly string[]]>) {
    if (aliases.includes(normalized) || aliases.some((alias) => normalized.includes(alias))) return key;
  }
  return null;
}

function parseAmount(value: unknown) {
  const text = cleanCell(value);
  if (!text || text === "-" || (text.length === 1 && [8211, 8212].includes(text.charCodeAt(0)))) return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /\bdr\b/i.test(text);
  const numeric = Number(text.replace(/\((.*)\)/, "$1").replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return negative ? -Math.abs(numeric) : numeric;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function validDateKey(year: number, month: number, day: number) {
  if (year < 1990 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseDate(value: unknown) {
  const text = cleanCell(value).replace(/,/g, "");
  if (!text) return null;
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial), 12));
    return date.toISOString().slice(0, 10);
  }
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return validDateKey(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDateKey(year, Number(match[2]), Number(match[1]));
  }
  match = /^(\d{1,2})[-\s]([a-zA-Z]{3,9})[-\s](\d{2,4})/.exec(text);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDateKey(year, MONTHS[match[2].toLowerCase()] || 0, Number(match[1]));
  }
  match = /^([a-zA-Z]{3,9})\s+(\d{1,2})\s+(\d{4})/.exec(text);
  if (match) return validDateKey(Number(match[3]), MONTHS[match[1].toLowerCase()] || 0, Number(match[2]));
  return null;
}

function csvRows(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const delimiters = [",", ";", "\t", "|"];
  const delimiter = delimiters.sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cleanCell(cell)); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cleanCell(cell)); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cleanCell(cell));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function xmlDecode(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function columnIndex(reference: string) {
  const letters = reference.replace(/[^A-Z]/gi, "").toUpperCase();
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

async function xlsxRows(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  const uncompressedBytes = entries.reduce((sum, entry) => {
    const size = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0);
    return sum + size;
  }, 0);
  if (entries.length > 2_000 || uncompressedBytes > 50 * 1024 * 1024) {
    throw new Error("The Excel statement expands beyond the safe processing limit.");
  }
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => xmlDecode([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")))
    : [];
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const relationships = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  let sheetPath = "xl/worksheets/sheet1.xml";
  const relationshipId = workbook?.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  if (relationshipId && relationships) {
    const escaped = relationshipId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const target = relationships.match(new RegExp(`<Relationship\\b[^>]*Id="${escaped}"[^>]*Target="([^"]+)"`))?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error("The Excel workbook does not contain a readable worksheet.");

  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1] || "A1";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      const value = type === "s" ? shared[Number(raw)] ?? "" : xmlDecode(raw);
      row[columnIndex(ref)] = cleanCell(value);
    }
    return row;
  }).filter((row) => row.some(Boolean));
}

async function pdfRows(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs's Node legacy build supports this runtime switch although its public
  // TypeScript declaration omits it. Keeping parsing on the request thread
  // avoids trying to resolve a browser worker from a bundled server route.
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const rows: string[][] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 100); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const text = cleanCell(item.str);
      if (!text) continue;
      const y = Math.round(Number(item.transform?.[5] || 0) / 3) * 3;
      const x = Number(item.transform?.[4] || 0);
      const line = lines.get(y) || [];
      line.push({ x, text });
      lines.set(y, line);
    }
    for (const [, line] of [...lines.entries()].sort((a, b) => b[0] - a[0])) {
      const positioned = line.sort((a, b) => a.x - b.x).map((item) => item.text);
      // Some PDF producers expose a whole visual row as one text item rather
      // than one item per column. Split that representation so the same table
      // mapper can still identify headers and transaction values.
      const values = positioned.length === 1 ? positioned[0].split(/\s+/).filter(Boolean) : positioned;
      if (values.length) rows.push(values);
    }
  }
  return rows;
}

function findHeader(rows: string[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 40); rowIndex += 1) {
    const columns: Partial<Record<HeaderKey, number>> = {};
    rows[rowIndex].forEach((cell, index) => {
      const kind = headerKind(cell);
      if (kind && columns[kind] == null) columns[kind] = index;
    });
    if (columns.date != null && (columns.credit != null || columns.debit != null || columns.amount != null)) {
      return { rowIndex, columns };
    }
  }
  return null;
}

function statementFromRows(rows: string[][]): ParsedBankStatement {
  const header = findHeader(rows);
  if (!header) throw new Error("Could not identify statement columns. Include date, description, and credit/debit or amount headers.");
  const transactions: ParsedBankTransaction[] = [];
  const warnings: string[] = [];
  const headers = rows[header.rowIndex].map(cleanCell);
  let skipped = 0;

  for (const row of rows.slice(header.rowIndex + 1)) {
    let alignedRow = row;
    if (header.columns.description != null && row.length > headers.length) {
      const overflow = row.length - headers.length;
      const descriptionIndex = header.columns.description;
      alignedRow = [
        ...row.slice(0, descriptionIndex),
        row.slice(descriptionIndex, descriptionIndex + overflow + 1).join(" "),
        ...row.slice(descriptionIndex + overflow + 1),
      ];
    }
    const date = parseDate(alignedRow[header.columns.date!]);
    if (!date) { if (row.some(Boolean)) skipped += 1; continue; }
    const credit = header.columns.credit == null ? null : parseAmount(alignedRow[header.columns.credit]);
    const debit = header.columns.debit == null ? null : parseAmount(alignedRow[header.columns.debit]);
    const signedAmount = header.columns.amount == null ? null : parseAmount(alignedRow[header.columns.amount]);
    const typeText = header.columns.type == null ? "" : cleanCell(alignedRow[header.columns.type]).toLowerCase();
    let type: "credit" | "debit" | null = null;
    let amount = 0;
    if (credit != null && Math.abs(credit) > 0) { type = "credit"; amount = Math.abs(credit); }
    else if (debit != null && Math.abs(debit) > 0) { type = "debit"; amount = Math.abs(debit); }
    else if (signedAmount != null && signedAmount !== 0) {
      type = /debit|\bdr\b|withdraw|outflow/.test(typeText) || signedAmount < 0 ? "debit" : "credit";
      amount = Math.abs(signedAmount);
    }
    if (!type || !Number.isFinite(amount) || amount <= 0) { skipped += 1; continue; }
    const description = cleanCell(header.columns.description == null ? "Bank transaction" : alignedRow[header.columns.description]) || "Bank transaction";
    const raw = Object.fromEntries(headers.map((name, index) => [name || `column_${index + 1}`, cleanCell(alignedRow[index])]).filter(([, value]) => value));
    transactions.push({
      date,
      description,
      reference: header.columns.reference == null ? null : cleanCell(alignedRow[header.columns.reference]) || null,
      type,
      amount: Math.round(amount * 100) / 100,
      balance: header.columns.balance == null ? null : parseAmount(alignedRow[header.columns.balance]),
      raw,
    });
  }
  if (!transactions.length) throw new Error("No dated credit or debit transactions could be read from this statement.");
  if (skipped) warnings.push(`${skipped} non-transaction or unreadable row(s) were skipped.`);
  transactions.sort((a, b) => a.date.localeCompare(b.date));
  return {
    transactions,
    periodStart: transactions[0].date,
    periodEnd: transactions[transactions.length - 1].date,
    totalCredit: transactions.filter((row) => row.type === "credit").reduce((sum, row) => sum + row.amount, 0),
    totalDebit: transactions.filter((row) => row.type === "debit").reduce((sum, row) => sum + row.amount, 0),
    warnings,
  };
}

export async function parseBankStatement(buffer: Buffer, extension: string) {
  const ext = extension.toLowerCase().replace(/^\./, "");
  const rows = ext === "csv"
    ? csvRows(buffer.toString("utf8").replace(/^\uFEFF/, ""))
    : ext === "xlsx"
      ? await xlsxRows(buffer)
      : ext === "pdf"
        ? await pdfRows(buffer)
        : [];
  if (!rows.length) throw new Error("The statement file is empty or unsupported. Use PDF, CSV, or XLSX.");
  return statementFromRows(rows);
}
