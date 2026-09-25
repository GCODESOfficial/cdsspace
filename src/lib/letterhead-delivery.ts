import "server-only";

import crypto from "node:crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { createPrivateAssetPrefix, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { releaseClientStorageReservation, reserveClientStorage } from "@/lib/client-storage";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

type Source = Record<string, unknown> & { id: string; title: string; body_html: string };

function escaped(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char); }

export async function deliverLetterheadToClient(input: { sourceId: string; adminOwnerId: string; adminEmail: string; clientId: string }) {
  const source = await glashMaybeOne<Source>(
    `select * from public.create_letterheads where id=$1::uuid and owner_kind='admin' and owner_id=$2 and deleted_at is null`,
    [input.sourceId, input.adminOwnerId],
  );
  if (!source) throw new Error("The letterhead could not be found in your admin workspace.");
  const client = await glashMaybeOne<{ id: string; email: string; full_name: string | null; company_name: string | null; public_user_id: string }>(
    `select id, email, full_name, company_name, public_user_id from public.profiles
      where id=$1::uuid and account_status='active' and email_verified_at is not null`, [input.clientId],
  );
  if (!client) throw new Error("Choose an active client account. Invited clients must finish creating their account before delivery.");
  const existing = await glashMaybeOne<{ id: string }>(
    `select id from public.create_letterheads where owner_kind='client' and owner_id=$1
      and delivered_from_letterhead_id=$2::uuid and deleted_at is null`, [client.id, source.id],
  );
  if (existing) throw new Error("This letterhead has already been delivered to that client.");

  const newId = crypto.randomUUID();
  // Compatibility storage is intentionally untyped by the query wrapper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const storage = db.storage.from(LETTERHEAD_BUCKET);
  const assets = [
    ["first_page", source.first_page_path, source.first_page_name],
    ["second_page", source.second_page_path, source.second_page_name],
    ["signature", source.signature_path, source.signature_name],
  ] as const;
  const prepared: { key: string; path: string; name: string | null; bytes: Buffer }[] = [];
  for (const [key, pathValue, nameValue] of assets) {
    const path = typeof pathValue === "string" ? pathValue : "";
    if (!path) continue;
    const { data, error } = await storage.download(path);
    if (error || !data) throw new Error(`The ${key.replace("_", " ")} asset could not be copied.`);
    prepared.push({ key, path, name: typeof nameValue === "string" ? nameValue : null, bytes: Buffer.from(await data.arrayBuffer()) });
  }
  const totalBytes = prepared.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
  let reservationId: string | null = null;
  const uploaded: string[] = [];
  try {
    reservationId = await reserveClientStorage(client.id, totalBytes, 0);
    const clientPrefix = createPrivateAssetPrefix({ kind: "client", id: client.id });
    const copied = new Map<string, { path: string; size: number; name: string | null }>();
    for (const asset of prepared) {
      const path = `${clientPrefix}/${newId}/${asset.key}-${crypto.randomUUID()}.png`;
      const { error } = await storage.upload(path, asset.bytes, { contentType: "image/png", upsert: false });
      if (error) throw new Error(error.message);
      uploaded.push(path); copied.set(asset.key, { path, size: asset.bytes.byteLength, name: asset.name });
    }
    await glashQuery(
      `insert into public.create_letterheads
        (id, owner_kind, owner_id, actor_email, scope, title, body_html, paper_size, has_second_page,
         first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
         signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width, signature_page,
         status, delivered_by_cds, delivered_from_letterhead_id, delivered_by_admin, delivered_at)
       values ($1::uuid,'client',$2,$3,'create',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         'ready',true,$21::uuid,$22,now())`,
      [newId, client.id, client.email, source.title, source.body_html, source.paper_size, Boolean(source.has_second_page),
        // The size columns are not-null with a default of 0: a letterhead with
        // no second page or no signature has zero bytes of it, not null.
        copied.get("first_page")?.path || null, copied.get("first_page")?.name || null, copied.get("first_page")?.size ?? 0,
        copied.get("second_page")?.path || null, copied.get("second_page")?.name || null, copied.get("second_page")?.size ?? 0,
        copied.get("signature")?.path || null, copied.get("signature")?.name || null, copied.get("signature")?.size ?? 0,
        Number(source.signature_x || 62), Number(source.signature_y || 74), Number(source.signature_width || 24), source.signature_page === "first" ? "first" : "last",
        source.id, input.adminEmail],
    );
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded).catch(() => undefined);
    throw error;
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }

  const link = `/create?workspace=client&tool=official-letterhead&letterhead=${newId}`;
  try {
    const { error } = await db.from("notifications").insert({ user_id: client.id, type: "status_change", title: "Letterhead delivered by CDS Space", message: `“${source.title}” is ready in your Create Studio.`, link, is_read: false });
    if (error) console.error("[letterhead-delivery] client notification failed:", error.message);
  } catch {
    // Delivery itself is durable even if the optional bell notification has a
    // transient outage; the email below provides a second delivery channel.
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
  const fullLink = `${site}${link}`;
  await sendEmail({
    to: client.email, fromName: "CDS Space", subject: `Your letterhead is ready: ${source.title}`,
    text: `Hello ${client.full_name || client.company_name || "there"},\n\nCDS Space delivered “${source.title}” to your Create Studio. Open it here: ${fullLink}`,
    html: brandedEmailHtml(`<p>Hello ${escaped(client.full_name || client.company_name || "there")},</p><p>CDS Space has delivered <strong>${escaped(source.title)}</strong> directly to your Create Studio.</p><p><a href="${escaped(fullLink)}" style="display:inline-block;border-radius:10px;background:#0A4FE8;color:#fff;text-decoration:none;padding:12px 20px;font-weight:700;">Open delivered letterhead</a></p>`, { eyebrow: "Create Studio delivery", preheader: `${source.title} is ready in your CDS Space account.` }),
  }).catch(() => undefined);
  return { id: newId, clientName: client.company_name || client.full_name || client.email };
}
