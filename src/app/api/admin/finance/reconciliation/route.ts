import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { callerSeesClientIdentity, financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { parseBankStatement } from "@/lib/finance/bank-statement-parser";
import { reconcileBankStatement } from "@/lib/finance/reconciliation";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertSecureBuffer, assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STATEMENT_BYTES = 15 * 1024 * 1024;

function extension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "statement";
}

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "finance_audit.view");
  if (denied) return denied;
  const url = new URL(request.url);
  if (url.searchParams.get("report") === "1") {
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "A valid report date range is required." }, { status: 400 });
    }
    const startMonth = from.slice(0, 7);
    const endMonth = to.slice(0, 7);
    const [invoices, invoicePayments, inflows, expenditures, contractorPayments, payrollRuns, employees] = await Promise.all([
      glashQuery(`select id, invoice_number, client_name, total, currency, amount_paid, balance_due, payment_percentage,
                         subtotal, tax_amount, tax_rate, status, issue_date, due_date
                    from public.finance_invoices
                   where issue_date between $1::date and $2::date and deleted_at is null`, [from, to]),
      glashQuery(`select payment.id, payment.invoice_id, payment.amount, payment.currency, payment.paid_on,
                         jsonb_build_object(
                           'invoice_number', invoice.invoice_number, 'client_name', invoice.client_name,
                           'total', invoice.total, 'subtotal', invoice.subtotal, 'tax_amount', invoice.tax_amount
                         ) as finance_invoices
                    from public.finance_invoice_payments payment
                    join public.finance_invoices invoice on invoice.id = payment.invoice_id
                   where payment.paid_on between $1::date and $2::date`, [from, to]),
      glashQuery(`select id, title, source, amount, currency, received_on, payment_method, reference, notes
                    from public.finance_inflows where received_on between $1::date and $2::date`, [from, to]),
      glashQuery(`select id, title, category, amount, currency, spent_on
                    from public.finance_expenditures where spent_on between $1::date and $2::date`, [from, to]),
      glashQuery(`select id, amount, currency, paid_on
                    from public.finance_contractor_payments where paid_on between $1::date and $2::date`, [from, to]),
      glashQuery(`select id, title, period, status, total, currency, created_at
                    from public.finance_payroll_runs where period between $1 and $2`, [startMonth, endMonth]),
      glashQuery(`select id, base_salary, currency from public.finance_employees where active is true`),
    ]);
    const seesClientIdentity = await callerSeesClientIdentity(request);
    const safeInvoices = seesClientIdentity ? invoices : invoices.map((invoice) => ({ ...invoice, client_name: "Restricted client" }));
    const safePayments = seesClientIdentity ? invoicePayments : invoicePayments.map((payment) => ({
      ...payment,
      finance_invoices: payment.finance_invoices && typeof payment.finance_invoices === "object"
        ? { ...payment.finance_invoices as Record<string, unknown>, client_name: "Restricted client" }
        : payment.finance_invoices,
    }));
    return NextResponse.json({ invoices: safeInvoices, invoicePayments: safePayments, inflows, expenditures, contractorPayments, payrollRuns, employees });
  }
  const statementId = url.searchParams.get("statement_id");
  if (statementId) {
    const statement = await glashMaybeOne(
      `select bank_statement.*, account.account_name
         from public.finance_bank_statements bank_statement
         left join public.sales_bank_accounts account on account.id = bank_statement.bank_account_id
        where bank_statement.id = $1 limit 1`,
      [statementId],
    );
    if (!statement) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    const transactions = await glashQuery(
      `select bank_transaction.*, invoice.invoice_number, invoice.client_name
         from public.finance_bank_transactions bank_transaction
         left join public.finance_invoices invoice on invoice.id = bank_transaction.matched_invoice_id
        where bank_transaction.statement_id = $1
        order by bank_transaction.txn_date asc, bank_transaction.created_at asc`,
      [statementId],
    );
    const seesClientIdentity = await callerSeesClientIdentity(request);
    const safeTransactions = seesClientIdentity ? transactions : transactions.map((transaction) => ({ ...transaction, client_name: transaction.client_name ? "Restricted client" : null }));
    return NextResponse.json({ statement, transactions: safeTransactions });
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(from || "") && /^\d{4}-\d{2}-\d{2}$/.test(to || "")
    ? "where coalesce(bank_statement.period_end, bank_statement.uploaded_at::date) >= $1::date and coalesce(bank_statement.period_start, bank_statement.uploaded_at::date) <= $2::date"
    : "";
  const params = dateFilter ? [from, to] : [];
  const [statements, accounts] = await Promise.all([
    glashQuery(
      `select bank_statement.*, account.account_name
         from public.finance_bank_statements bank_statement
         left join public.sales_bank_accounts account on account.id = bank_statement.bank_account_id
         ${dateFilter}
        order by bank_statement.uploaded_at desc
        limit 100`,
      params,
    ),
    glashQuery(
      `select id, currency, bank_name, account_name, account_number, iban, active, sort_order
         from public.sales_bank_accounts
        where active is true
        order by currency, sort_order, bank_name`,
    ),
  ]);
  return NextResponse.json({ statements, accounts });
}

export async function POST(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "finance_audit.reconcile");
  if (denied) return denied;
  const session = await getAdminSessionAsync(request);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const bankAccountId = String(form?.get("bank_account_id") || "");
  const notes = String(form?.get("notes") || "").trim().slice(0, 2000);
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a bank statement file." }, { status: 400 });
  if (!bankAccountId) return NextResponse.json({ error: "Choose the bank account for this statement." }, { status: 400 });
  if (file.size > MAX_STATEMENT_BYTES) return NextResponse.json({ error: "Bank statements are limited to 15MB." }, { status: 413 });

  const ext = extension(file.name);
  if (!["pdf", "csv", "xlsx"].includes(ext)) {
    return NextResponse.json({ error: "Use a PDF, CSV, or XLSX bank statement." }, { status: 415 });
  }
  const account = await glashMaybeOne<{
    id: string; bank_name: string; account_name: string; account_number: string | null; iban: string | null; currency: string;
  }>(
    `select id, bank_name, account_name, account_number, iban, currency
       from public.sales_bank_accounts where id = $1 and active is true limit 1`,
    [bankAccountId],
  );
  if (!account) return NextResponse.json({ error: "The selected bank account is unavailable." }, { status: 404 });

  let buffer: Buffer;
  try {
    if (ext === "csv") {
      buffer = Buffer.from(await file.arrayBuffer());
      await assertSecureBuffer(buffer, { activeContent: true, fileName: file.name });
    } else {
      const safe = await assertSafeUpload(file, { allow: ext === "pdf" ? ["pdf"] : ["office"], maxBytes: MAX_STATEMENT_BYTES });
      buffer = safe.buffer;
    }
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 415;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The statement file was rejected." }, { status });
  }

  let parsed;
  try {
    parsed = await parseBankStatement(buffer, ext);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The statement could not be read." }, { status: 422 });
  }

  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  const objectPath = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const contentType = ext === "pdf"
    ? "application/pdf"
    : ext === "csv"
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const db = financeDb();
  const { error: uploadError } = await db.storage.from("bank-statements").upload(objectPath, buffer, { contentType, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  try {
    const result = await reconcileBankStatement({
      parsed,
      account,
      filename: file.name,
      storagePath: objectPath,
      fileSha256: digest,
      uploadedBy: session?.name || session?.email || "Finance admin",
      notes,
    });
    await logActivity({
      action: "finance.statement_reconciled",
      page: "finance/audit",
      resource_type: "finance_bank_statement",
      resource_id: result.statementId,
      resource_label: `${account.bank_name} · ${file.name}`,
      metadata: result,
    });
    return NextResponse.json({ ok: true, result, warnings: parsed.warnings });
  } catch (error) {
    await db.storage.from("bank-statements").remove([objectPath]).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Statement reconciliation failed.";
    return NextResponse.json({ error: message }, { status: /already been uploaded/i.test(message) ? 409 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "finance_audit.reconcile");
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Statement id is required." }, { status: 400 });
  const statement = await glashMaybeOne<{ id: string; storage_path: string; processing_status: string }>(
    "select id, storage_path, processing_status from public.finance_bank_statements where id = $1 limit 1",
    [id],
  );
  if (!statement) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
  if (["completed", "completed_with_warnings"].includes(statement.processing_status)) {
    return NextResponse.json({ error: "Processed statements are retained for audit integrity and cannot be deleted." }, { status: 409 });
  }
  await glashQuery("delete from public.finance_bank_statements where id = $1", [id]);
  await financeDb().storage.from("bank-statements").remove([statement.storage_path]).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
