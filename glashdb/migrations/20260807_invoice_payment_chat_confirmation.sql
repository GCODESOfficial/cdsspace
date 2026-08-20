-- Prevent duplicate payment-proof chat messages when an admin retries a
-- verification or the receipt-email job is replayed.
create unique index if not exists idx_chat_messages_invoice_payment_confirmation
  on public.chat_messages ((metadata ->> 'receipt_id'))
  where metadata ->> 'kind' = 'invoice_payment_confirmed'
    and nullif(metadata ->> 'receipt_id', '') is not null;
