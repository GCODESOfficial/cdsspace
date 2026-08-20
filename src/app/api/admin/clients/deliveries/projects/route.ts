import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { ensureProjectChannel } from "@/lib/team-chat-channels";
import { CLIENT_BILLING_CURRENCIES, normalizeClientBillingCurrency } from "@/lib/client-billing";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "deliveries.create");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name, 180);
  const clientReference = cleanText(body.client_reference, 120)
    || (cleanText(body.client_user_id, 80) ? `profile:${cleanText(body.client_user_id, 80)}` : "");
  const requestedCurrency = normalizeClientBillingCurrency(body.currency);

  if (name.length < 3) return NextResponse.json({ error: "Add a project name." }, { status: 400 });
  if (!clientReference) return NextResponse.json({ error: "Choose the client for this project." }, { status: 400 });

  try {
    const [clientKind, clientId] = clientReference.split(":", 2);
    const client = clientKind === "profile" ? await glashMaybeOne<{
      id: string;
      email: string | null;
      full_name: string | null;
      company_name: string | null;
      billing_currency: string | null;
    }>(
      `select id, email, full_name, company_name, billing_currency
         from public.profiles
        where id = $1 and email_verified_at is not null and account_status = 'active'
        limit 1`,
      [clientId],
    ) : null;
    const manualClient = clientKind === "manual" ? await glashMaybeOne<{
      id: string;
      name: string;
      brand_name: string | null;
      email: string | null;
      platform_user_id: string | null;
    }>(
      `select id, name, brand_name, email, platform_user_id
         from public.clients where id = $1 limit 1`,
      [clientId],
    ) : null;
    if (!client && !manualClient) return NextResponse.json({ error: "Client was not found." }, { status: 404 });

    const linkedProfile = !client && manualClient?.platform_user_id
      ? await glashMaybeOne<{ id: string; billing_currency: string | null }>(
          "select id, billing_currency from public.profiles where id = $1 and email_verified_at is not null and account_status = 'active' limit 1",
          [manualClient.platform_user_id],
        )
      : null;
    const clientUserId = client?.id || linkedProfile?.id || null;
    const currency = requestedCurrency || normalizeClientBillingCurrency(client?.billing_currency || linkedProfile?.billing_currency) || "NGN";
    if (!CLIENT_BILLING_CURRENCIES.includes(currency)) {
      return NextResponse.json({ error: "Choose a valid billing currency." }, { status: 400 });
    }
    const clientName = cleanText(
      client?.company_name || client?.full_name || client?.email || manualClient?.brand_name || manualClient?.name,
      180,
    ) || "Client";
    const clientEmail = client?.email || manualClient?.email || null;
    const [project] = await glashQuery<{
      id: string;
      name: string;
      client: string;
      client_email: string | null;
      user_id: string | null;
      currency: string;
      status: string;
    }>(
      `insert into public.finance_projects
        (name, client, client_email, user_id, manual_client_id, currency, status, notes)
       values ($1,$2,$3,$4,$5,$6,'active',$7)
       returning id, name, client, client_email, user_id, currency, status`,
      [name, clientName, clientEmail, clientUserId, manualClient?.id || null, currency, "Created from Sales Hub delivery upload."],
    );
    await ensureProjectChannel(project.id).catch(() => null);
    await logActivity({
      action: "project.create",
      page: "clients/deliveries",
      resource_type: "finance_project",
      resource_id: project.id,
      resource_label: `${project.name}: ${project.client}`,
      metadata: { source: "delivery_upload", currency, client_user_id: clientUserId, manual_client_id: manualClient?.id || null },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("[sales-hub/deliveries/projects] create failed", error);
    return NextResponse.json({ error: "Could not create the project." }, { status: 500 });
  }
}
