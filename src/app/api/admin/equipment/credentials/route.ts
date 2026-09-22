import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  decryptEquipmentPassword,
  equipmentActorKey,
  equipmentUuid,
} from "@/lib/equipment-inventory";

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(
    req,
    "equipment_inventory.credentials",
  );
  if (denied || !session)
    return (
      denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  const body = await req.json().catch(() => ({}));
  const id = equipmentUuid(body.id);
  if (!id)
    return NextResponse.json(
      { error: "Invalid equipment ID." },
      { status: 400 },
    );
  const row = await glashMaybeOne<{
    password_ciphertext: string | null;
    password_iv: string | null;
    password_tag: string | null;
  }>(
    `select password_ciphertext,password_iv,password_tag from public.admin_equipment where id=$1 and deleted_at is null`,
    [id],
  );
  if (!row)
    return NextResponse.json(
      { error: "Equipment was not found." },
      { status: 404 },
    );
  if (!row.password_ciphertext || !row.password_iv || !row.password_tag)
    return NextResponse.json(
      { error: "No password is stored for this equipment." },
      { status: 404 },
    );
  const actorKey = equipmentActorKey(session);
  await glashQuery(
    `insert into public.admin_equipment_audit(equipment_id,actor_key,action) values($1,$2,'credentials.revealed')`,
    [id, actorKey],
  );
  const password = decryptEquipmentPassword({
    ciphertext: row.password_ciphertext,
    iv: row.password_iv,
    tag: row.password_tag,
  });
  return NextResponse.json(
    { ok: true, password },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    },
  );
}
