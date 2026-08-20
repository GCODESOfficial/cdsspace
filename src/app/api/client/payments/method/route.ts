import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import {
  getPaystackCardSetupConfig,
  getPaystackStatus,
  loadClientPaymentMethod,
  removeClientPaymentMethod,
} from "@/lib/paystack";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = getPaystackStatus();
  return NextResponse.json({
    provider: "paystack",
    ...status,
    setup: getPaystackCardSetupConfig(),
    method: await loadClientPaymentMethod(account.user.id),
  });
}

export async function DELETE() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await removeClientPaymentMethod(account.user.id);
  return NextResponse.json({ ok: true });
}
