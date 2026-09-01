import "server-only";

import dns from "node:dns/promises";

/**
 * Contact routes traced from a domain's own DNS records.
 *
 * DNS does not store mailboxes, so this is honest about what it can and cannot
 * give you. What it does give: the address in the SOA record, which is the
 * technical contact the domain owner published; addresses written into TXT
 * records; and the mail provider from the MX records, which tells you the
 * address format the company will accept and whether mail is even deliverable.
 */

export interface DnsContact {
  kind: "soa_admin" | "txt_email" | "mail_provider" | "no_mail";
  value: string;
  detail: string;
}

const PROVIDERS: Array<{ match: RegExp; name: string }> = [
  { match: /google|googlemail|aspmx/i, name: "Google Workspace" },
  { match: /outlook|protection\.outlook|microsoft/i, name: "Microsoft 365" },
  { match: /zoho/i, name: "Zoho Mail" },
  { match: /proton/i, name: "Proton Mail" },
  { match: /yandex/i, name: "Yandex Mail" },
  { match: /mimecast/i, name: "Mimecast" },
  { match: /barracuda/i, name: "Barracuda" },
  { match: /pphosted|proofpoint/i, name: "Proofpoint" },
  { match: /secureserver|godaddy/i, name: "GoDaddy" },
  { match: /ionos|1and1/i, name: "IONOS" },
  { match: /hostinger/i, name: "Hostinger" },
  { match: /namecheap|privateemail/i, name: "Namecheap Private Email" },
  { match: /amazonaws|amazonses/i, name: "Amazon SES" },
  { match: /mailgun|sendgrid|postmark/i, name: "a transactional mail service" },
];

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * The SOA record's responsible-party field is an email with the first dot
 * standing in for the @ sign, which is how "admin.example.com" means
 * "admin@example.com".
 */
function emailFromSoaRname(rname: string) {
  const value = String(rname || "").replace(/\.$/, "");
  if (!value.includes(".")) return null;
  const at = value.indexOf(".");
  const local = value.slice(0, at).replace(/\\/g, "");
  const host = value.slice(at + 1);
  if (!local || !host.includes(".")) return null;
  return `${local}@${host}`.toLowerCase();
}

export async function traceDomainContacts(domain: string): Promise<DnsContact[]> {
  const host = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!host || !host.includes(".")) return [];
  const contacts: DnsContact[] = [];

  const [soa, txt, mx] = await Promise.all([
    dns.resolveSoa(host).catch(() => null),
    dns.resolveTxt(host).catch(() => [] as string[][]),
    dns.resolveMx(host).catch(() => [] as Array<{ exchange: string; priority: number }>),
  ]);

  if (soa?.hostmaster) {
    const email = emailFromSoaRname(soa.hostmaster);
    // Registrar defaults are not the company, so they are not offered as leads.
    if (email && !/^(hostmaster|dns|noc|awsdns|cloudflare|domains?)@/i.test(email) && !/(cloudflare|awsdns|godaddy|namecheap|registrar)/i.test(email)) {
      contacts.push({
        kind: "soa_admin",
        value: email,
        detail: "Published in the domain's SOA record as the technical contact for the domain.",
      });
    }
  }

  for (const record of txt) {
    const line = record.join("");
    for (const found of line.match(EMAIL) || []) {
      const email = found.toLowerCase();
      if (contacts.some((entry) => entry.value === email)) continue;
      contacts.push({ kind: "txt_email", value: email, detail: "Written into a DNS TXT record on the domain." });
    }
  }

  if (mx.length) {
    const exchanges = mx.sort((a, b) => a.priority - b.priority).map((entry) => entry.exchange).join(" ");
    const provider = PROVIDERS.find((entry) => entry.match.test(exchanges));
    contacts.push({
      kind: "mail_provider",
      value: provider?.name || mx[0].exchange,
      detail: provider
        ? `The domain receives mail through ${provider.name}, so addresses on this domain are live and deliverable.`
        : `The domain receives mail through ${mx[0].exchange}.`,
    });
  } else {
    contacts.push({
      kind: "no_mail",
      value: host,
      detail: "The domain publishes no MX records, so it cannot receive email at all. Any address on this domain will bounce, and outreach has to go through a social account or a phone call.",
    });
  }

  return contacts.slice(0, 10);
}

/**
 * Address patterns worth trying for a domain that accepts mail. These are
 * conventions, not discovered addresses, and are labelled as such so nobody
 * mistakes a guess for a verified contact.
 */
export function likelyMailboxes(domain: string, mailWorks: boolean) {
  if (!mailWorks) return [];
  const host = domain.replace(/^www\./, "");
  return ["info", "hello", "contact", "enquiries", "sales"].map((box) => `${box}@${host}`);
}
