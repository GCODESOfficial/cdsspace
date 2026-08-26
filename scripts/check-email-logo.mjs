import fs from "node:fs";
import path from "node:path";

/**
 * The branded email shell references the CDS logo as `cid:cdslogo@cdsspace`,
 * which only renders when the message carries the matching inline attachment.
 * `sendEmail` attaches it automatically. Anything that builds its own transport
 * and calls `transporter.sendMail` must attach it too, or the recipient sees a
 * broken image box where the logo should be.
 */

const root = process.cwd();
const SKIP = new Set(["src/lib/email-from.ts", "src/lib/email-logo.ts"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(path.join(root, "src"))) {
  const rel = path.relative(root, file);
  if (SKIP.has(rel)) continue;
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("sendMail")) continue;
  if (!source.includes("brandedEmailHtml") && !source.includes("EmailHtml(")) continue;
  if (source.includes("emailAttachmentsFor") || source.includes("emailLogoAttachment")) continue;
  offenders.push(rel);
}

if (offenders.length > 0) {
  console.error("These senders build branded email but never attach the inline logo:");
  for (const file of offenders) console.error(`- ${file}`);
  console.error("Use sendEmail(), or spread emailAttachmentsFor(html) into attachments.");
  process.exit(1);
}

console.log("Email logo check passed (every branded sender attaches the inline logo).");
