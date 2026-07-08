/**
 * One-time Gmail API OAuth setup - obtains a refresh token so the app can send
 * mail via the Gmail HTTPS API (no SMTP, no third party).
 *
 * Prerequisites (in Google Cloud Console, the project that owns your
 * GOOGLE_CLIENT_ID):
 *   1. Enable the "Gmail API".
 *   2. On your OAuth client, add this Authorized redirect URI:
 *        http://localhost:5051/oauth2/callback
 *   3. OAuth consent screen: add contact.cdsspace@gmail.com as a Test user,
 *      OR (recommended) Publish the app to "In production" so the refresh
 *      token does not expire after 7 days. The gmail.send scope shows an
 *      "unverified app" warning - that's fine for your own account.
 *
 * Run:  node scripts/gmail-oauth-setup.mjs
 * Then sign in as contact.cdsspace@gmail.com, approve, and paste the printed
 * GMAIL_REFRESH_TOKEN into .env.
 */
import { readFileSync } from "node:fs";
import http from "node:http";

const PORT = Number(process.env.PORT || 5051);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.send";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  } catch {
    /* no .env */
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const clientId = env.GMAIL_CLIENT_ID || env.GOOGLE_CLIENT_ID;
const clientSecret = env.GMAIL_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
const loginHint = env.EMAIL_USER || "";

if (!clientId || !clientSecret) {
  console.error("✗ Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (or GMAIL_*) in .env.");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2/callback")) {
    res.writeHead(404).end("Not found");
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err || !code) {
    res.writeHead(400).end(`OAuth error: ${err || "no code"}`);
    console.error(`✗ OAuth error: ${err || "no code returned"}`);
    server.close();
    process.exit(1);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const body = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !body?.refresh_token) {
      res.writeHead(500).end("Token exchange failed - see terminal.");
      console.error(`✗ Token exchange failed: ${body?.error_description || body?.error || tokenRes.status}`);
      if (!body?.refresh_token && body?.access_token) {
        console.error("  (No refresh_token returned - revoke prior access at myaccount.google.com/permissions and retry; prompt=consent should force one.)");
      }
      server.close();
      process.exit(1);
    }
    res.writeHead(200, { "Content-Type": "text/html" }).end(
      "<h2>✓ Success</h2><p>Refresh token captured. Return to your terminal, add it to .env, and close this tab.</p>",
    );
    console.log("\n✓ Success. Add this line to your .env:\n");
    console.log(`GMAIL_REFRESH_TOKEN=${body.refresh_token}\n`);
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end("Error - see terminal.");
    console.error("✗", e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nGmail OAuth setup listening on ${REDIRECT_URI}`);
  console.log("\n1) Make sure this redirect URI is registered on your OAuth client (see file header).");
  console.log("2) Open this URL in your browser and sign in as contact.cdsspace@gmail.com:\n");
  console.log(authUrl + "\n");
});
