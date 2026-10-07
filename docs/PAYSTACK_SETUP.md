# Paystack account billing setup

The client **Account Config** screen uses Paystack hosted checkout to add or
replace a reusable payment option. CDS Space never collects or stores a raw
card number or CVV.

## Environment

Configure these values locally and in the live deployment:

```text
PAYSTACK_SECRET_KEY=sk_test_... or sk_live_...
NEXT_PUBLIC_SITE_URL=https://your-public-cds-space-domain.example
```

## Currencies

Paystack charges in NGN only for now (`PAYSTACK_CURRENCIES` in
`src/lib/paystack.ts`). Add USD there once Paystack approves international
payments and a USD payout account. Each checkout uses the client's own currency:

- Card setup charges the client's billing currency: NGN 50 or USD 2.
- Invoices are paid in the invoice currency.
- Subscriptions are paid in the client's billing currency.

Clients billed in GBP, EUR, RWF, CNY or AED see no Paystack option on the web
or in the app, and the server refuses Paystack checkout for them. They pay by
bank transfer.

No Paystack public key is required for this flow because transaction
initialization happens on the server and the client is redirected to the
Paystack-hosted authorization URL.

## Webhook

Add the following URL to the API Keys & Webhooks area of the Paystack
dashboard:

```text
https://your-public-cds-space-domain.example/api/client/payments/paystack/webhook
```

The endpoint validates `x-paystack-signature` using HMAC SHA-512 before it
handles an event. The browser callback also verifies the transaction directly
with Paystack before saving a payment method.

## Stored information

The server stores Paystack's reusable authorization, its associated payment
email, and masked display information such as card brand, last four digits and
expiry. Payment tables have row-level security enabled with no browser-facing
policies; only authenticated server routes return masked fields.

Test the flow with a Paystack test key before switching to a live key.
