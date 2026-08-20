# CDS Space security deployment checklist

The application now enforces the controls it can own: origin and request-size
checks, security headers, legal-content sanitisation, parameterised database
queries, bounded per-instance token-bucket request throttles, persistent
authentication throttles, five-strike client account locks, signed browser
proof challenges on direct client authentication, and a bound 15-minute email
OTP before a client dashboard session is issued.

The remaining controls live at the hosting, DNS, or email-provider boundary and
must be enabled for production. Do not copy development test credentials into a
production environment.

## Required production environment

- `NEXT_PUBLIC_SITE_URL=https://cdsspace.pro`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: optional production Cloudflare Turnstile
  site key. When both Turnstile keys are absent, the app uses its internal
  signed proof challenge.
- `TURNSTILE_SECRET_KEY`: the matching optional production secret key
- `CLIENT_LOGIN_SECURITY_SECRET`: at least 32 cryptographically random bytes;
  keep it stable and secret because it HMACs network, identity, OTP, and browser
  binding values
- A working domain-authenticated email transport for `support@cdsspace.pro`

If `CLIENT_LOGIN_SECURITY_SECRET` is not set, the server-only GlashDB service
key is used as a compatibility fallback. A dedicated, stable secret is still
recommended so security proofs are not coupled to database-key rotation.

`INTERNAL_BOT_POW_DIFFICULTY_BITS` optionally controls the internal browser
proof cost (12-20, default 14). Do not raise it without measuring common mobile
and assistive browsers.

## WAF, denial-of-service, and bot controls

Application controls now protect general page/API traffic with bounded
per-instance token buckets, and protect login, signup, password recovery, OTP,
and browser-proof replay with durable database counters. They reduce automated
Layer 7 abuse, but no code running at the origin can stop a volumetric attack
that saturates the connection before a request reaches the app. If an edge
service becomes available later:

1. Proxy every public hostname and reject direct traffic to the origin.
2. Enable managed DDoS protection and managed WAF rules, including SQL
   injection and cross-site scripting rules.
3. Enable managed bot detection. Challenge suspicious automated traffic while
   allowing verified search, monitoring, and accessibility clients.
4. Add rate-limit rules for `/login`, `/signup`, `/forgot-password`,
   `/reset-password`, authentication actions, and expensive API endpoints.
5. Exempt only authenticated/signed payment webhooks and protected cron calls.
6. Alert on spikes in 403, 413, 429, login failure, OTP failure, and password
   recovery events.

Do not place a CAPTCHA interstitial in front of every public page. It harms
accessibility and legitimate crawlers and still does not stop network-layer
DDoS. The app issues a short-lived, action-bound, IP/user-agent-bound proof only
for abuse-sensitive direct authentication, verifies it server-side, and rejects
replay. Turnstile automatically takes precedence if valid production keys are
configured later.

## Anti-phishing and sender-spoofing controls

The security emails use the CDS Space branded template and never ask users to
reply with a password or OTP. Complete the sender-domain setup described in
`docs/email-avatar-and-bimi.md`:

1. Send using a provider that DKIM-signs with `d=cdsspace.pro`.
2. Publish an aligned SPF record containing only authorised senders.
3. Publish DMARC with aggregate reporting and `p=quarantine`; inspect reports,
   then move to `p=reject` once legitimate sources are aligned.
4. Keep password-reset links on the canonical HTTPS CDS Space hostname.
5. Optionally add BIMI only after SPF, DKIM, and DMARC enforcement are correct.

DNS changes must be made in the authoritative DNS account. Incorrect SPF,
DKIM, or DMARC records can prevent legitimate mail delivery, so verify each
record with the selected mail provider before enforcing rejection.

## Verification after deployment

- Complete direct client login and confirm that a six-digit branded email code
  is required and expires after 15 minutes.
- Enter an incorrect password five times and confirm the account requires the
  password-reset flow before another direct login.
- Confirm password recovery gives the same outward response for known and
  unknown addresses.
- Confirm cross-origin unsafe requests return 403 and oversized auth requests
  return 413.
- Confirm production responses include CSP, HSTS, `nosniff`, frame protection,
  a restrictive referrer policy, and permissions policy.
- Confirm the internal browser proof completes on login, signup, and password
  recovery, is validated server-side, and cannot be reused. If Turnstile is
  configured, confirm its tokens are also validated server-side.
- Test SPF, DKIM, and DMARC alignment with a message sent through the production
  transport.
- Review WAF and application security events without logging passwords, raw
  OTPs, session cookies, or database credentials.
