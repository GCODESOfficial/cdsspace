import "server-only";

import crypto from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { getGlashPoolClient } from "@/lib/glashdb/postgres";
import type { ParsedBankStatement, ParsedBankTransaction } from "@/lib/finance/bank-statement-parser";

type BankAccount = {
  id: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  currency: string;
};

type InvoiceCandidate = {
  id: string;
  invoice_number: string;
  client_name: string;
  currency: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  issue_date: string;
  due_date: string | null;
};

type ExistingInvoicePayment = {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  payment_reference: string | null;
  bank_transaction_id: string | null;
  invoice_number: string;
  client_name: string;
};

export interface ReconciliationResult {
  statementId: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  otherInflowCount: number;
  reviewCount: number;
  duplicateCount: number;
  status: "completed" | "completed_with_warnings";
}

function normalized(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function moneyEqual(a: number, b: number) {
  return Math.abs(Number(a) - Number(b)) <= 0.01;
}

function dayDistance(left: string, right: string) {
  const leftTime = Date.parse(`${left.slice(0, 10)}T00:00:00Z`);
  const rightTime = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? Math.abs(leftTime - rightTime) / 86_400_000
    : Number.POSITIVE_INFINITY;
}

function existingPaymentMatch(transaction: ParsedBankTransaction, payments: ExistingInvoicePayment[]) {
  const transactionReference = normalized(transaction.reference);
  if (transactionReference) {
    const referenceMatches = payments.filter((payment) =>
      normalized(payment.payment_reference) === transactionReference
      && moneyEqual(Number(payment.amount), transaction.amount),
    );
    if (referenceMatches.length === 1) {
      return { payment: referenceMatches[0], confidence: 100, reason: "The amount and bank reference match an invoice payment already recorded." };
    }
  }

  const sameDayMatches = payments.filter((payment) =>
    moneyEqual(Number(payment.amount), transaction.amount)
    && dayDistance(payment.paid_on, transaction.date) === 0,
  );
  if (sameDayMatches.length === 1) {
    return { payment: sameDayMatches[0], confidence: 98, reason: "The amount and payment date match an invoice payment already recorded." };
  }

  const haystack = normalized(`${transaction.description} ${transaction.reference || ""}`);
  const describedMatches = payments.filter((payment) =>
    moneyEqual(Number(payment.amount), transaction.amount)
    && dayDistance(payment.paid_on, transaction.date) <= 3
    && (haystack.includes(normalized(payment.invoice_number))
      || (normalized(payment.client_name).length >= 5 && haystack.includes(normalized(payment.client_name)))),
  );
  if (describedMatches.length === 1) {
    return { payment: describedMatches[0], confidence: 96, reason: "The amount, date and narration match an invoice payment already recorded." };
  }
  return null;
}

function categorizeDebit(description: string) {
  const value = description.toLowerCase();
  if (/salary|payroll|wage|pension/.test(value)) return "Payroll";
  if (/fee|charge|commission|levy|stamp duty|vat/.test(value)) return "Bank charges";
  if (/rent|lease/.test(value)) return "Rent";
  if (/internet|data|airtime|telecom/.test(value)) return "Internet and communications";
  if (/electric|power|utility|water/.test(value)) return "Utilities";
  if (/software|subscription|hosting|domain|cloud/.test(value)) return "Software and subscriptions";
  if (/transport|fuel|uber|bolt|flight/.test(value)) return "Transport";
  if (/transfer/.test(value)) return "Transfer";
  return "Bank statement expense";
}

function invoiceMatch(transaction: ParsedBankTransaction, invoices: InvoiceCandidate[]) {
  const haystack = normalized(`${transaction.description} ${transaction.reference || ""}`);
  const exact = invoices.filter((invoice) => haystack.includes(normalized(invoice.invoice_number)));
  if (exact.length === 1) {
    return { invoice: exact[0], confidence: 100, reason: `Invoice number ${exact[0].invoice_number} appears in the bank narration.` };
  }

  const amountMatches = invoices.filter((invoice) =>
    invoice.status !== "cancelled"
    && moneyEqual(Number(invoice.balance_due || Math.max(Number(invoice.total) - Number(invoice.amount_paid || 0), 0)), transaction.amount),
  );
  if (amountMatches.length === 1) {
    return { invoice: amountMatches[0], confidence: 92, reason: "The credit exactly matches one outstanding invoice balance." };
  }

  const clientMatches = invoices.filter((invoice) => {
    const client = normalized(invoice.client_name);
    const outstanding = Number(invoice.balance_due || Math.max(Number(invoice.total) - Number(invoice.amount_paid || 0), 0));
    return client.length >= 5 && haystack.includes(client) && transaction.amount <= outstanding + 0.01;
  });
  if (clientMatches.length === 1) {
    return { invoice: clientMatches[0], confidence: 88, reason: "The payer name matches one client and the amount fits its outstanding balance." };
  }


  // Historical invoices may have been marked paid before their statement was
  // imported. A unique same-value paid invoice is treated as already recorded
  // only within a bounded billing window, avoiding a second general inflow.
  const paidAmountMatches = invoices.filter((invoice) => {
    if (invoice.status !== "paid" || !moneyEqual(Number(invoice.total), transaction.amount)) return false;
    const earliest = new Date(`${invoice.issue_date}T00:00:00Z`).getTime() - 14 * 86_400_000;
    const latestAnchor = invoice.due_date || invoice.issue_date;
    const latest = new Date(`${latestAnchor}T00:00:00Z`).getTime() + 120 * 86_400_000;
    const transactionTime = new Date(`${transaction.date}T00:00:00Z`).getTime();
    return transactionTime >= earliest && transactionTime <= latest;
  });
  if (paidAmountMatches.length === 1) {
    return { invoice: paidAmountMatches[0], confidence: 84, reason: "The credit uniquely matches a paid invoice total within its billing window." };
  }
  return null;
}

function dedupeKey(account: BankAccount, row: ParsedBankTransaction, occurrence: number) {
  const identity = account.id || account.account_number || account.iban || account.bank_name;
  const reference = normalized(row.reference);
  const description = normalized(row.description).slice(0, 160);
  const parts = reference
    ? [identity, row.type, row.amount.toFixed(2), reference]
    : [identity, row.date, row.type, row.amount.toFixed(2), description, row.balance?.toFixed(2) || String(occurrence)];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

async function queryOne<T extends QueryResultRow>(client: PoolClient, text: string, params: unknown[] = []) {
  const result = await client.query<T>(text, params);
  return (result.rows[0] as T | undefined) ?? null;
}

export async function reconcileBankStatement(input: {
  parsed: ParsedBankStatement;
  account: BankAccount;
  filename: string;
  storagePath: string;
  fileSha256: string;
  uploadedBy: string;
  notes?: string | null;
}): Promise<ReconciliationResult> {
  const client = await getGlashPoolClient();
  try {
    await client.query("begin");
    const existing = await queryOne<{ id: string }>(client,
      `select id from public.finance_bank_statements
        where coalesce(bank_account_id::text, lower(coalesce(account_number, ''))) = $1
          and file_sha256 = $2
        limit 1`,
      [input.account.id, input.fileSha256],
    );
    if (existing) throw new Error("This exact statement has already been uploaded for the selected bank account.");

    const statement = await queryOne<{ id: string }>(client,
      `insert into public.finance_bank_statements (
         filename, storage_path, bank_account_id, bank_name, account_number, currency,
         period_start, period_end, total_credit, total_debit, file_sha256,
         processing_status, notes, uploaded_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'processing',$12,$13)
       returning id`,
      [
        input.filename, input.storagePath, input.account.id, input.account.bank_name,
        input.account.account_number || input.account.iban, input.account.currency,
        input.parsed.periodStart, input.parsed.periodEnd, input.parsed.totalCredit,
        input.parsed.totalDebit, input.fileSha256, input.notes || null, input.uploadedBy,
      ],
    );
    if (!statement) throw new Error("Could not create the bank statement record.");

    const invoicesResult = await client.query<InvoiceCandidate & Record<string, unknown>>(
      `select id, invoice_number, client_name, currency, total, amount_paid, balance_due,
              status, issue_date, due_date
         from public.finance_invoices
        where deleted_at is null and currency = $1 and status <> 'cancelled'
        order by issue_date desc`,
      [input.account.currency],
    );
    const invoices = invoicesResult.rows as InvoiceCandidate[];
    const paymentsResult = await client.query<ExistingInvoicePayment & QueryResultRow>(
      `select payment.id, payment.invoice_id, payment.amount, payment.paid_on,
              payment.payment_reference, payment.bank_transaction_id,
              invoice.invoice_number, invoice.client_name
         from public.finance_invoice_payments payment
         join public.finance_invoices invoice on invoice.id = payment.invoice_id
        where payment.currency = $1`,
      [input.account.currency],
    );
    const existingPayments = paymentsResult.rows as ExistingInvoicePayment[];
    const matchedExistingPaymentIds = new Set<string>();
    const occurrences = new Map<string, number>();
    let matchedCount = 0;
    let otherInflowCount = 0;
    let reviewCount = 0;
    let duplicateCount = 0;

    for (const row of input.parsed.transactions) {
      const occurrenceBase = [row.date, row.type, row.amount.toFixed(2), normalized(row.reference) || normalized(row.description)].join("|");
      const occurrence = (occurrences.get(occurrenceBase) || 0) + 1;
      occurrences.set(occurrenceBase, occurrence);
      const key = dedupeKey(input.account, row, occurrence);
      const transaction = await queryOne<{ id: string }>(client,
        `insert into public.finance_bank_transactions (
           statement_id, txn_date, description, transaction_reference, amount, txn_type,
           balance, currency, dedupe_key, raw_data
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         on conflict (dedupe_key) where dedupe_key is not null do nothing
         returning id`,
        [statement.id, row.date, row.description, row.reference, row.amount, row.type, row.balance, input.account.currency, key, JSON.stringify(row.raw)],
      );
      if (!transaction) { duplicateCount += 1; continue; }

      if (row.type === "credit") {
        const recordedPayment = existingPaymentMatch(
          row,
          existingPayments.filter((payment) => !matchedExistingPaymentIds.has(payment.id)),
        );
        if (recordedPayment) {
          matchedExistingPaymentIds.add(recordedPayment.payment.id);
          await client.query(
            `update public.finance_invoice_payments
                set bank_transaction_id = coalesce(bank_transaction_id, $2)
              where id = $1 and (bank_transaction_id is null or bank_transaction_id = $2)`,
            [recordedPayment.payment.id, transaction.id],
          );
          await client.query(
            `update public.finance_bank_transactions
                set matched_invoice_id = $2, reconciled = true, match_status = 'already_recorded',
                    match_confidence = $3, match_reason = $4, category = 'Invoice payment'
              where id = $1`,
            [transaction.id, recordedPayment.payment.invoice_id, recordedPayment.confidence, `${recordedPayment.reason} No duplicate inflow was created.`],
          );
          matchedCount += 1;
          continue;
        }
        const match = invoiceMatch(row, invoices);
        if (match) {
          const invoice = match.invoice;
          const outstanding = Math.max(Number(invoice.total) - Number(invoice.amount_paid || 0), 0);
          if ((outstanding <= 0 || invoice.status === "paid") && moneyEqual(row.amount, Number(invoice.total))) {
            await client.query(
              `update public.finance_bank_transactions
                  set matched_invoice_id = $2, reconciled = true, match_status = 'already_recorded',
                      match_confidence = $3, match_reason = $4, category = 'Invoice payment'
                where id = $1`,
              [transaction.id, invoice.id, match.confidence, `${match.reason} The invoice was already fully recorded as paid, so no duplicate inflow was created.`],
            );
            matchedCount += 1;
            continue;
          }
          if (outstanding <= 0 || invoice.status === "paid") {
            await client.query(
              `update public.finance_bank_transactions
                  set matched_invoice_id = $2, match_status = 'needs_review', match_confidence = $3,
                      match_reason = $4, category = 'Unallocated credit'
                where id = $1`,
              [transaction.id, invoice.id, match.confidence, `${match.reason} The invoice is already paid, but this credit has a different amount and needs review.`],
            );
            reviewCount += 1;
            continue;
          }
          if (row.amount <= outstanding + 0.01) {
            await client.query(
              `select public.record_finance_invoice_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [invoice.id, row.amount, input.account.currency, row.date, "bank_statement", row.reference, "bank_statement", transaction.id, transaction.id, row.description, input.uploadedBy],
            );
            invoice.amount_paid = Number(invoice.amount_paid || 0) + row.amount;
            invoice.balance_due = Math.max(Number(invoice.total) - invoice.amount_paid, 0);
            invoice.status = invoice.balance_due <= 0.01 ? "paid" : "partially_paid";
            await client.query(
              `update public.finance_bank_transactions
                  set matched_invoice_id = $2, reconciled = true, match_status = 'invoice_payment',
                      match_confidence = $3, match_reason = $4, category = 'Invoice payment'
                where id = $1`,
              [transaction.id, invoice.id, match.confidence, match.reason],
            );
            matchedCount += 1;
            continue;
          }
          await client.query(
            `update public.finance_bank_transactions
                set matched_invoice_id = $2, match_status = 'needs_review', match_confidence = $3,
                    match_reason = $4, category = 'Unallocated credit'
              where id = $1`,
            [transaction.id, invoice.id, match.confidence, `${match.reason} The credit exceeds the invoice balance and needs review.`],
          );
          reviewCount += 1;
          continue;
        }

        const inflow = await queryOne<{ id: string }>(client,
          `insert into public.finance_inflows
             (title, source, amount, currency, received_on, payment_method, reference, notes, bank_transaction_id)
           values ($1,$2,$3,$4,$5,'bank_statement',$6,$7,$8)
           returning id`,
          [row.description, input.account.bank_name, row.amount, input.account.currency, row.date, row.reference, `Imported from ${input.filename}`, transaction.id],
        );
        await client.query(
          `update public.finance_bank_transactions
              set matched_inflow_id = $2, reconciled = true, match_status = 'inflow_recorded',
                  match_confidence = 100, match_reason = 'No invoice match was found; recorded once as a bank-statement inflow.',
                  category = 'Other inflow'
            where id = $1`,
          [transaction.id, inflow?.id || null],
        );
        otherInflowCount += 1;
      } else {
        const category = categorizeDebit(row.description);
        const expenditure = await queryOne<{ id: string }>(client,
          `insert into public.finance_expenditures
             (title, category, amount, currency, spent_on, recurring, notes, bank_transaction_id)
           values ($1,$2,$3,$4,$5,false,$6,$7)
           returning id`,
          [row.description, category, row.amount, input.account.currency, row.date, `Imported from ${input.filename}${row.reference ? ` · Ref ${row.reference}` : ""}`, transaction.id],
        );
        await client.query(
          `update public.finance_bank_transactions
              set matched_expenditure_id = $2, reconciled = true, match_status = 'expense_recorded',
                  match_confidence = 100, match_reason = 'Recorded once as an expenditure from the bank statement.', category = $3
            where id = $1`,
          [transaction.id, expenditure?.id || null, category],
        );
        matchedCount += 1;
      }
    }

    const status = input.parsed.warnings.length || duplicateCount || reviewCount ? "completed_with_warnings" : "completed";
    await client.query(
      `update public.finance_bank_statements
          set processing_status = $2, row_count = $3, matched_count = $4,
              unmatched_count = $5, other_inflow_count = $6, review_count = $5,
              duplicate_count = $7, processed_at = now(), processing_error = $8
        where id = $1`,
      [statement.id, status, input.parsed.transactions.length, matchedCount, reviewCount, otherInflowCount, duplicateCount, input.parsed.warnings.join(" ") || null],
    );
    await client.query("commit");
    return { statementId: statement.id, rowCount: input.parsed.transactions.length, matchedCount, unmatchedCount: reviewCount, otherInflowCount, reviewCount, duplicateCount, status };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
