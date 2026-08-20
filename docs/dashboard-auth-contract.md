# Dashboard authentication contract

Dashboard navigation is authorised by a CDS Space first-party session tied to the authenticated account's stable internal user ID. Google, password/OTP, or another identity provider is a login gateway: once that gateway succeeds, it must issue the relevant CDS Space session cookie before entering the dashboard.

## Required behaviour

- Client and marketer sessions are signed, HTTP-only, secure in production, same-site, audience-bound, expiry-bound, and scoped to `/`.
- Team sessions are opaque, database-backed, expiry checked, device-bound where applicable, and revocable.
- Admin sessions are signed and verified server-side before permissions are evaluated.
- A dashboard request validates its own first-party session and current account status. It does not require the upstream identity provider to respond again during ordinary page navigation.
- A transient provider, refresh, database, or network failure must not be interpreted as an explicit logout. Redirect to login only for a missing, invalid, expired, revoked, mismatched, suspended, or closed account session.
- Login success rotates or replaces the relevant first-party session. Logout and account closure clear or revoke it.
- The route's public user identifier is presentation and scoping data. The signed internal user UUID remains the authentication principal, and mismatched scoped URLs are canonicalised to the authenticated account.

## Regression protection

`npm run check:dashboard-auth` verifies session signing rules and the integration points for client, marketer, team, and admin dashboards. It runs before every production build.

