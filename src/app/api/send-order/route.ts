import { NextResponse } from "next/server";
import { sendAdminAlert } from "@/lib/admin-alerts";

/**
 * Public order form.
 *
 * This used to hand-roll a transport and call an `emailAttachmentsFor` helper
 * that does not exist, so every submission threw and the desk was never told an
 * order had come in. It now goes through the shared admin alert, which reaches
 * both desk addresses immediately.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const value = (...keys: string[]) => {
      for (const key of keys) {
        const found = body[key];
        if (typeof found === "string" && found.trim()) return found.trim();
      }
      return "";
    };

    const name = value("name", "fullName", "full_name", "firstName") || "Someone";
    const email = value("email");
    const product = value("product", "item", "service", "package");

    const sent = await sendAdminAlert({
      kind: "order",
      subject: product ? `${name} ordered ${product}` : `${name} placed an order`,
      // Every field the form sent, in the order it sent them, so a new field on
      // the form shows up here without another code change.
      details: Object.entries(body).map(([key, entry]) => [
        key.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
        typeof entry === "object" ? JSON.stringify(entry) : entry,
      ]),
      actionPath: "/admin/orders",
      actionLabel: "Open orders",
      ...(email ? { replyTo: email } : {}),
    });

    return NextResponse.json({ success: sent > 0 });
  } catch (error) {
    console.error("[send-order] failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
