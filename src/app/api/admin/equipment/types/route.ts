import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  cleanEquipmentText,
  equipmentActorKey,
  equipmentUuid,
} from "@/lib/equipment-inventory";

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(
    req,
    "equipment_inventory.manage_types",
  );
  if (denied || !session)
    return (
      denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  const body = await req.json().catch(() => ({}));
  const name = cleanEquipmentText(body.name, 80);
  if (name.length < 2)
    return NextResponse.json(
      { error: "Type name is required." },
      { status: 400 },
    );
  try {
    const row = await glashMaybeOne(
      `insert into public.admin_equipment_types(name,description,created_by) values($1,$2,$3) returning id,name,description,created_at,updated_at`,
      [
        name,
        cleanEquipmentText(body.description, 500) || null,
        equipmentActorKey(session),
      ],
    );
    return NextResponse.json({ ok: true, type: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          String((error as { code?: unknown })?.code) === "23505"
            ? "That equipment type already exists."
            : "Type could not be added.",
      },
      { status: 409 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { denied } = await requireAdmin(
    req,
    "equipment_inventory.manage_types",
  );
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = equipmentUuid(body.id);
  const name = cleanEquipmentText(body.name, 80);
  if (!id || name.length < 2)
    return NextResponse.json(
      { error: "A valid type and name are required." },
      { status: 400 },
    );
  try {
    const row = await glashMaybeOne(
      `update public.admin_equipment_types set name=$2,description=$3,updated_at=now() where id=$1 returning id,name,description,created_at,updated_at`,
      [id, name, cleanEquipmentText(body.description, 500) || null],
    );
    if (!row)
      return NextResponse.json(
        { error: "Type was not found." },
        { status: 404 },
      );
    return NextResponse.json({ ok: true, type: row });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          String((error as { code?: unknown })?.code) === "23505"
            ? "That equipment type already exists."
            : "Type could not be updated.",
      },
      { status: 409 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { denied } = await requireAdmin(
    req,
    "equipment_inventory.manage_types",
  );
  if (denied) return denied;
  const id = equipmentUuid(new URL(req.url).searchParams.get("id"));
  if (!id)
    return NextResponse.json(
      { error: "Invalid equipment type." },
      { status: 400 },
    );
  const used = await glashMaybeOne<{ count: number }>(
    `select count(*)::int count from public.admin_equipment where equipment_type_id=$1 and deleted_at is null`,
    [id],
  );
  if (Number(used?.count || 0) > 0)
    return NextResponse.json(
      { error: "Reassign equipment using this type before deleting it." },
      { status: 409 },
    );
  await glashQuery(`delete from public.admin_equipment_types where id=$1`, [
    id,
  ]);
  return NextResponse.json({ ok: true });
}
