import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import {
  birthdayWishedForNextOccurrence,
  daysUntilBirthday,
  defaultBirthdayMessage,
  nextBirthdayYear,
} from "@/lib/birthday-card";

export const dynamic = "force-dynamic";

/**
 * Birthday reminders, split into "today" and "upcoming". Each client's own
 * reminder window is respected, and completed outreach is suppressed.
 */
export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;

  const windowDays = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get("days") || 30)));
  const sb = financeDb();
  const { data, error } = await sb
    .from("clients")
    .select("id, name, brand_name, email, phone, whatsapp, birthday, birthday_reminder_enabled, birthday_reminder_days, preferred_contact_method, last_birthday_wish_at, birthday_wished_for_year")
    .not("birthday", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type ClientRow = {
    id: string; name: string; brand_name: string | null;
    // birthday is a Postgres date, which the driver returns as a Date.
    email: string | null; phone: string | null; whatsapp: string | null; birthday: string | Date | null;
    birthday_reminder_enabled: boolean;
    birthday_reminder_days: number;
    preferred_contact_method: "email" | "whatsapp" | "phone" | null;
    last_birthday_wish_at: string | null;
    birthday_wished_for_year: number | null;
  };
  const rows = ((data ?? []) as ClientRow[])
    .map((c) => ({ ...c, days_until: daysUntilBirthday(c.birthday), message: defaultBirthdayMessage(c.name || "") }))
    .filter((c) => (
      c.days_until !== null
      && c.birthday_reminder_enabled !== false
      && !birthdayWishedForNextOccurrence(c.birthday, c.birthday_wished_for_year)
    ))
    .sort((a, b) => (a.days_until as number) - (b.days_until as number));

  return NextResponse.json({
    today: rows.filter((c) => c.days_until === 0),
    upcoming: rows.filter((c) => (
      (c.days_until as number) > 0
      && (c.days_until as number) <= windowDays
      && (c.days_until as number) <= (c.birthday_reminder_days || 30)
    )),
  });
}

/** Records that the team completed birthday outreach for the next occurrence. */
export async function PATCH(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });

  const sb = financeDb();
  const { data: client, error: readError } = await sb
    .from("clients")
    .select("id, birthday")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const wishedForYear = nextBirthdayYear(client.birthday);
  if (!wishedForYear) {
    return NextResponse.json({ error: "Add a birthday before marking wishes as sent" }, { status: 400 });
  }

  const wishedAt = new Date().toISOString();
  const { error: updateError } = await sb
    .from("clients")
    .update({ last_birthday_wish_at: wishedAt, birthday_wished_for_year: wishedForYear })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id, wished_at: wishedAt, wished_for_year: wishedForYear });
}
