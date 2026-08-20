# Paystack account billing setup

The client **Account Config** screen uses Paystack hosted checkout to add or
replace a reusable payment option. CDS Space never collects or stores a raw
card number or CVV.

## Environment

Configure these values locally and in the live deployment:

```text
PAYSTACK_SECRET_KEY=sk_test_... or sk_live_...
PAYSTACK_CARD_SETUP_CURRENCY=NGN
PAYSTACK_CARD_SETUP_AMOUNT=5000
NEXT_PUBLIC_SITE_URL=https://your-public-cds-space-domain.example
```

`PAYSTACK_CARD_SETUP_AMOUNT` is expressed in the currency's minor unit. The
default is `5000` in NGN, which is NGN 50. The supported setup currencies are
NGN, GHS, ZAR, KES and USD.

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
