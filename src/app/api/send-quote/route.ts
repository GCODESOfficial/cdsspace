import { NextResponse } from "next/server";
import { sendAdminAlert } from "@/lib/admin-alerts";

/**
 * Public quote request.
 *
 * Two bugs lived here. It called an `emailAttachmentsFor` helper that does not
 * exist, so every request threw; and it addressed the notification to the
 * requester's own address rather than to us, so even had it worked, nobody at
 * CDS Space would have seen it. Both desk addresses are now told immediately,
 * with Reply-To set to the requester so answering the email reaches them.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const text = (key: string) => {
      const found = body[key];
      return typeof found === "string" ? found.trim() : "";
    };

    const name = [text("firstName"), text("lastName")].filter(Boolean).join(" ") || text("name") || "Someone";
    const email = text("email");
    const company = text("company");

    const sent = await sendAdminAlert({
      kind: "quote",
      subject: company ? `${name} (${company})` : name,
      details: [
        ["Name", name],
        ["Email", email],
        ["Country", text("country")],
        ["Preferred time (UTC+1)", text("time")],
        ["Company / project", company],
        ["Interest", text("interest")],
      ],
      body: text("description"),
      actionPath: "/admin/finance/quotations",
      actionLabel: "Open quotations",
      ...(email ? { replyTo: email } : {}),
    });

    return NextResponse.json({ success: sent > 0 });
  } catch (error) {
    console.error("[send-quote] failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
