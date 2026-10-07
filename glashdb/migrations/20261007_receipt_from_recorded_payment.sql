-- Receipts take their method and reference from the submission the payment was
-- recorded against. Verified Paystack payments are "initiated" submissions
-- (20261007_paystack_initiated_submissions.sql), which the old "latest pending
-- submission" lookup missed, so their receipts fell back to bank_transfer.

create or replace function public.issue_invoice_receipt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pending_payment public.invoice_payment_submissions%rowtype;
  recorded_submission_id text;
  generated_receipt_number text;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select payment.source_id into recorded_submission_id
      from public.finance_invoice_payments payment
     where payment.invoice_id = new.id
       and payment.source_type = 'payment_submission'
     order by payment.created_at desc
     limit 1;

    select * into pending_payment
      from public.invoice_payment_submissions submission
     where submission.invoice_id = new.id
       and (submission.id::text = recorded_submission_id or submission.status = 'pending')
     order by (submission.id::text = recorded_submission_id) desc nulls last, submission.submitted_at desc
     limit 1;

    if pending_payment.id is not null then
      update public.invoice_payment_submissions
         set status = 'confirmed',
             reviewed_at = coalesce(reviewed_at, now()),
             updated_at = now()
       where id = pending_payment.id
         and status in ('initiated', 'pending');
    end if;

    generated_receipt_number := 'RCT-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.finance_receipts (
      receipt_number,
      invoice_id,
      payment_submission_id,
      client_name,
      client_email,
      amount,
      currency,
      payment_method,
      payment_reference,
      paid_at
    ) values (
      generated_receipt_number,
      new.id,
      pending_payment.id,
      coalesce(nullif(new.client_name, ''), 'CDS Space Client'),
      new.client_email,
      new.total,
      new.currency,
      coalesce(pending_payment.method, 'bank_transfer'),
      pending_payment.transfer_reference,
      now()
    ) on conflict (invoice_id) do nothing;
  end if;

  return new;
end;
$function$;

-- Repair Paystack receipts issued while the lookup missed initiated submissions.
update public.finance_receipts receipt
   set payment_method = 'paystack',
       payment_reference = submission.transfer_reference,
       payment_submission_id = submission.id
  from public.finance_invoice_payments payment
  join public.invoice_payment_submissions submission
    on submission.id::text = payment.source_id
 where payment.invoice_id = receipt.invoice_id
   and payment.source_type = 'payment_submission'
   and submission.method = 'paystack'
   and submission.status = 'confirmed'
   and receipt.payment_submission_id is null;
