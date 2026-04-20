import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const folder = (form.get("folder") as string) || "finance";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const ext = file.name.split(".").pop() || "bin";
  const path = `${folder}/${uuidv4()}.${ext}`;
  const sb = financeDb();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from("media").upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = sb.storage.from("media").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
