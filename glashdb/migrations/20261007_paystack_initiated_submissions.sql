-- A Paystack checkout that has been opened but not paid is "initiated", not
-- "pending". Pending means a bank transfer awaiting Finance review: it took
-- the invoice's single pending slot, showed clients "your bank transfer is
-- being confirmed" after they cancelled checkout, and put unpaid attempts in
-- the admin confirmation queue. Verified Paystack payments move straight from
-- initiated to confirmed.

alter table public.invoice_payment_submissions
  drop constraint if exists invoice_payment_submissions_status_check;

alter table public.invoice_payment_submissions
  add constraint invoice_payment_submissions_status_check
  check (status = any (array['initiated'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text, 'cancelled'::text]));

update public.invoice_payment_submissions
   set status = 'initiated', updated_at = now()
 where method = 'paystack' and status = 'pending';

create index if not exists idx_invoice_payment_submissions_paystack_reference
  on public.invoice_payment_submissions (transfer_reference)
  where method = 'paystack';
