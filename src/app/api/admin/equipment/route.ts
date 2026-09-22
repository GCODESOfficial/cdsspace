import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import {
  cleanEquipmentSecret,
  cleanEquipmentText,
  encryptEquipmentPassword,
  equipmentActorKey,
  equipmentDate,
  equipmentTimestamp,
  equipmentUuid,
  safeEquipmentReceiptPath,
} from "@/lib/equipment-inventory";
import { createPendingCustodyAgreement } from "@/lib/equipment-custody";
import { notifyTeamMember } from "@/lib/notify-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONDITIONS = new Set(["new", "good", "fair", "needs_repair", "retired"]);
const STATUSES = new Set([
  "available",
  "assigned",
  "maintenance",
  "retired",
  "lost",
]);

function responseHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
}

function normalize(body: Record<string, unknown>) {
  const assignedTeamMemberId = equipmentUuid(body.assignedTeamMemberId);
  const requestedStatus = cleanEquipmentText(body.status, 30);
  const status = assignedTeamMemberId
    ? "assigned"
    : STATUSES.has(requestedStatus) && requestedStatus !== "assigned"
      ? requestedStatus
      : "available";
  return {
    assetTag: cleanEquipmentText(body.assetTag, 60),
    name: cleanEquipmentText(body.name, 140),
    equipmentTypeId: equipmentUuid(body.equipmentTypeId),
    serialNumber: cleanEquipmentText(body.serialNumber, 140) || null,
    manufacturer: cleanEquipmentText(body.manufacturer, 100) || null,
    model: cleanEquipmentText(body.model, 100) || null,
    condition: CONDITIONS.has(cleanEquipmentText(body.condition, 30))
      ? cleanEquipmentText(body.condition, 30)
      : "good",
    status,
    location: cleanEquipmentText(body.location, 160) || null,
    purchaseDate: equipmentDate(body.purchaseDate),
    purchaseCost:
      Number.isFinite(Number(body.purchaseCost)) &&
      Number(body.purchaseCost) >= 0
        ? Number(body.purchaseCost)
        : null,
    currency: /^[A-Z]{3}$/.test(
      cleanEquipmentText(body.currency, 3).toUpperCase(),
    )
      ? cleanEquipmentText(body.currency, 3).toUpperCase()
      : "NGN",
    warrantyExpiresAt: equipmentDate(body.warrantyExpiresAt),
    notes: cleanEquipmentText(body.notes, 4000) || null,
    assignedTeamMemberId,
    assignedAt: assignedTeamMemberId
      ? equipmentTimestamp(body.assignedAt) || new Date().toISOString()
      : null,
    assignmentNote: cleanEquipmentText(body.assignmentNote, 1000) || null,
    receiptStoragePath: safeEquipmentReceiptPath(body.receiptStoragePath),
    receiptFileName: cleanEquipmentText(body.receiptFileName, 180) || null,
    receiptContentType:
      cleanEquipmentText(body.receiptContentType, 100) || null,
    receiptSizeBytes: Number.isFinite(Number(body.receiptSizeBytes))
      ? Math.max(0, Number(body.receiptSizeBytes))
      : null,
  };
}

function validate(input: ReturnType<typeof normalize>) {
  if (input.assetTag.length < 2) return "Asset tag is required.";
  if (input.name.length < 2) return "Equipment name is required.";
  if (!input.equipmentTypeId) return "Choose an equipment type.";
  return null;
}

const LIST_SQL = `select e.id, e.asset_tag, e.name, e.equipment_type_id, t.name as equipment_type_name,
  e.serial_number, e.manufacturer, e.model, e.condition, e.status, e.location,
  e.purchase_date, e.purchase_cost, e.currency, e.warranty_expires_at, e.notes,
  e.receipt_file_name, e.receipt_content_type, e.receipt_size_bytes,
  e.assigned_team_member_id, e.assigned_at, m.full_name as assigned_team_member_name,
  custody.status as custody_status, custody.signed_at as custody_signed_at,
  custody.signer_name as custody_signer_name, custody.agreement_version as custody_version,
  (e.password_ciphertext is not null) as has_password, e.created_at, e.updated_at
 from public.admin_equipment e
 join public.admin_equipment_types t on t.id=e.equipment_type_id
 left join public.team_members m on m.id=e.assigned_team_member_id
 left join lateral (
   select c.status, c.signed_at, c.signer_name, c.agreement_version
     from public.admin_equipment_custody_agreements c
     join public.admin_equipment_assignments a on a.id=c.assignment_id
    where c.equipment_id=e.id and a.returned_at is null
    order by c.created_at desc limit 1
 ) custody on true
 where e.deleted_at is null
 order by (e.status='assigned') desc, e.updated_at desc`;

type CustodyNotice = { memberId: string; deviceName: string; assetTag: string };

/**
 * Raises the custody agreement for a new assignment, inside the caller's
 * transaction, so a device is never handed over without one to sign. Returns
 * what the assignee should be told once the transaction commits.
 */
async function raiseCustodyAgreement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { equipmentId: string; assignmentId: string; teamMemberId: string; assignedAt: string },
): Promise<CustodyNotice | null> {
  const device = await client.query(
    `select e.asset_tag, e.name, e.serial_number, e.manufacturer, e.model, e.condition,
            e.purchase_cost, e.currency, t.name as equipment_type_name, m.full_name as member_name
       from public.admin_equipment e
       join public.admin_equipment_types t on t.id=e.equipment_type_id
       join public.team_members m on m.id=$2
      where e.id=$1`,
    [input.equipmentId, input.teamMemberId],
  );
  const row = device.rows[0];
  if (!row) return null;
  await createPendingCustodyAgreement(client, {
    equipmentId: input.equipmentId,
    assignmentId: input.assignmentId,
    teamMemberId: input.teamMemberId,
    memberName: row.member_name,
    assignedAt: input.assignedAt,
    device: row,
  });
  return { memberId: input.teamMemberId, deviceName: row.name, assetTag: row.asset_tag };
}

async function sendCustodyNotice(notice: CustodyNotice | null) {
  if (!notice) return;
  await notifyTeamMember({
    recipient_id: notice.memberId,
    kind: "equipment_custody",
    title: "Sign for the device assigned to you",
    body: `${notice.deviceName} (${notice.assetTag}) is now in your care. Sign the custody agreement to confirm you accept responsibility for it.`,
    link: "/team/equipment",
    actor_is_admin: true,
  });
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(
    req,
    "equipment_inventory.view",
  );
  if (denied || !session)
    return (
      denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  const actorKey = equipmentActorKey(session);
  const [equipment, types, members, draft, assignments] = await Promise.all([
    glashQuery<Record<string, unknown>>(LIST_SQL),
    glashQuery(
      `select id, name, description, created_at, updated_at from public.admin_equipment_types order by name`,
    ),
    glashQuery(
      `select id, full_name, role_title, department from public.team_members where is_active=true order by full_name`,
    ),
    glashMaybeOne<{ payload: Record<string, unknown> }>(
      `select payload from public.admin_equipment_drafts where admin_key=$1`,
      [actorKey],
    ),
    glashQuery(`select a.id, a.equipment_id, a.team_member_id, m.full_name as team_member_name, a.assigned_at, a.returned_at, a.assignment_note
      from public.admin_equipment_assignments a join public.team_members m on m.id=a.team_member_id
      order by a.assigned_at desc limit 300`),
  ]);
  return NextResponse.json(
    {
      ok: true,
      equipment,
      types,
      members,
      assignments,
      draft: draft?.payload || null,
    },
    { headers: responseHeaders() },
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action === "save_draft" ? "save_draft" : "create";
  const permission =
    action === "save_draft"
      ? "equipment_inventory.manage"
      : "equipment_inventory.manage";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session)
    return (
      denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  const actorKey = equipmentActorKey(session);

  if (action === "save_draft") {
    const payload = normalize(
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {},
    );
    await glashQuery(
      `insert into public.admin_equipment_drafts(admin_key,payload,updated_at) values($1,$2::jsonb,now())
      on conflict(admin_key) do update set payload=excluded.payload,updated_at=now()`,
      [actorKey, JSON.stringify(payload)],
    );
    return NextResponse.json(
      { ok: true, savedAt: new Date().toISOString() },
      { headers: responseHeaders() },
    );
  }

  const input = normalize(body);
  const error = validate(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const encrypted = encryptEquipmentPassword(
    cleanEquipmentSecret(body.password),
  );
  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ id: string }>(
      `insert into public.admin_equipment
      (asset_tag,name,equipment_type_id,serial_number,manufacturer,model,condition,status,location,purchase_date,purchase_cost,currency,warranty_expires_at,notes,
       password_ciphertext,password_iv,password_tag,receipt_storage_path,receipt_file_name,receipt_content_type,receipt_size_bytes,
       assigned_team_member_id,assigned_at,created_by,updated_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$24) returning id`,
      [
        input.assetTag,
        input.name,
        input.equipmentTypeId,
        input.serialNumber,
        input.manufacturer,
        input.model,
        input.condition,
        input.status,
        input.location,
        input.purchaseDate,
        input.purchaseCost,
        input.currency,
        input.warrantyExpiresAt,
        input.notes,
        encrypted?.ciphertext || null,
        encrypted?.iv || null,
        encrypted?.tag || null,
        input.receiptStoragePath,
        input.receiptFileName,
        input.receiptContentType,
        input.receiptSizeBytes,
        input.assignedTeamMemberId,
        input.assignedAt,
        actorKey,
      ],
    );
    const id = result.rows[0].id;
    let custodyNotice: CustodyNotice | null = null;
    if (input.assignedTeamMemberId) {
      const assignment = await client.query(
        `insert into public.admin_equipment_assignments(equipment_id,team_member_id,assigned_at,assignment_note,assigned_by) values($1,$2,$3,$4,$5) returning id`,
        [
          id,
          input.assignedTeamMemberId,
          input.assignedAt,
          input.assignmentNote,
          actorKey,
        ],
      );
      custodyNotice = await raiseCustodyAgreement(client, {
        equipmentId: id,
        assignmentId: assignment.rows[0].id,
        teamMemberId: input.assignedTeamMemberId,
        assignedAt: input.assignedAt!,
      });
    }
    await client.query(
      `delete from public.admin_equipment_drafts where admin_key=$1`,
      [actorKey],
    );
    await client.query(
      `insert into public.admin_equipment_audit(equipment_id,actor_key,action,metadata) values($1,$2,'equipment.created',$3::jsonb)`,
      [
        id,
        actorKey,
        JSON.stringify({
          assigned: !!input.assignedTeamMemberId,
          hasReceipt: !!input.receiptStoragePath,
          hasPassword: !!encrypted,
        }),
      ],
    );
    await client.query("commit");
    await sendCustodyNotice(custodyNotice);
    return NextResponse.json(
      { ok: true, id },
      { status: 201, headers: responseHeaders() },
    );
  } catch (cause) {
    await client.query("rollback");
    const code = String((cause as { code?: unknown })?.code || "");
    return NextResponse.json(
      {
        error:
          code === "23505"
            ? "That asset tag or serial number is already in use."
            : "Equipment could not be saved.",
      },
      { status: code === "23505" ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  const { session, denied } = await requireAdmin(
    req,
    "equipment_inventory.manage",
  );
  if (denied || !session)
    return (
      denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = equipmentUuid(body.id);
  if (!id)
    return NextResponse.json(
      { error: "Invalid equipment ID." },
      { status: 400 },
    );
  const input = normalize(body);
  const error = validate(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const actorKey = equipmentActorKey(session);
  const passwordProvided =
    typeof body.password === "string" && body.password.trim().length > 0;
  const clearPassword = body.clearPassword === true;
  const encrypted = passwordProvided
    ? encryptEquipmentPassword(cleanEquipmentSecret(body.password))
    : null;
  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const current = await client.query<{
      assigned_team_member_id: string | null;
      assigned_at: string | null;
    }>(
      `select assigned_team_member_id,assigned_at from public.admin_equipment where id=$1 and deleted_at is null for update`,
      [id],
    );
    if (!current.rows[0])
      throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
    const assignmentChanged =
      current.rows[0].assigned_team_member_id !== input.assignedTeamMemberId;
    let custodyNotice: CustodyNotice | null = null;
    if (assignmentChanged) {
      await client.query(
        `update public.admin_equipment_assignments set returned_at=now(),returned_by=$2 where equipment_id=$1 and returned_at is null`,
        [id, actorKey],
      );
      if (input.assignedTeamMemberId) {
        const assignment = await client.query(
          `insert into public.admin_equipment_assignments(equipment_id,team_member_id,assigned_at,assignment_note,assigned_by) values($1,$2,$3,$4,$5) returning id`,
          [
            id,
            input.assignedTeamMemberId,
            input.assignedAt,
            input.assignmentNote,
            actorKey,
          ],
        );
        // A device passed to someone else is signed for again: the new holder
        // accepts responsibility, and the previous one is released from it.
        custodyNotice = await raiseCustodyAgreement(client, {
          equipmentId: id,
          assignmentId: assignment.rows[0].id,
          teamMemberId: input.assignedTeamMemberId,
          assignedAt: input.assignedAt!,
        });
      }
    } else if (input.assignedTeamMemberId) {
      await client.query(
        `update public.admin_equipment_assignments set assigned_at=$2,assignment_note=$3 where equipment_id=$1 and returned_at is null`,
        [id, input.assignedAt, input.assignmentNote],
      );
    }
    await client.query(
      `update public.admin_equipment set asset_tag=$2,name=$3,equipment_type_id=$4,serial_number=$5,manufacturer=$6,model=$7,condition=$8,status=$9,location=$10,purchase_date=$11,purchase_cost=$12,currency=$13,warranty_expires_at=$14,notes=$15,
      receipt_storage_path=coalesce($16,receipt_storage_path),receipt_file_name=coalesce($17,receipt_file_name),receipt_content_type=coalesce($18,receipt_content_type),receipt_size_bytes=coalesce($19,receipt_size_bytes),
      assigned_team_member_id=$20,assigned_at=$21,
      password_ciphertext=case when $22 then $23 when $24 then null else password_ciphertext end,
      password_iv=case when $22 then $25 when $24 then null else password_iv end,
      password_tag=case when $22 then $26 when $24 then null else password_tag end,
      updated_by=$27,updated_at=now() where id=$1 and deleted_at is null`,
      [
        id,
        input.assetTag,
        input.name,
        input.equipmentTypeId,
        input.serialNumber,
        input.manufacturer,
        input.model,
        input.condition,
        input.status,
        input.location,
        input.purchaseDate,
        input.purchaseCost,
        input.currency,
        input.warrantyExpiresAt,
        input.notes,
        input.receiptStoragePath,
        input.receiptFileName,
        input.receiptContentType,
        input.receiptSizeBytes,
        input.assignedTeamMemberId,
        input.assignedAt,
        passwordProvided,
        encrypted?.ciphertext || null,
        clearPassword,
        encrypted?.iv || null,
        encrypted?.tag || null,
        actorKey,
      ],
    );
    await client.query(
      `insert into public.admin_equipment_audit(equipment_id,actor_key,action,metadata) values($1,$2,'equipment.updated',$3::jsonb)`,
      [
        id,
        actorKey,
        JSON.stringify({
          assignmentChanged,
          passwordChanged: passwordProvided || clearPassword,
        }),
      ],
    );
    await client.query("commit");
    await sendCustodyNotice(custodyNotice);
    return NextResponse.json({ ok: true }, { headers: responseHeaders() });
  } catch (cause) {
    await client.query("rollback");
    const code = String((cause as { code?: unknown })?.code || "");
    return NextResponse.json(
      {
        error:
          code === "NOT_FOUND"
            ? "Equipment was not found."
            : code === "23505"
              ? "That asset tag or serial number is already in use."
              : "Equipment could not be updated.",
      },
      { status: code === "NOT_FOUND" ? 404 : code === "23505" ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const { session, denied } = await requireAdmin(
    req,
    "equipment_inventory.manage",
  );
  if (denied || !session)
    return (
      denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  const id = equipmentUuid(new URL(req.url).searchParams.get("id"));
  if (!id)
    return NextResponse.json(
      { error: "Invalid equipment ID." },
      { status: 400 },
    );
  const actorKey = equipmentActorKey(session);
  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const updated = await client.query(
      `update public.admin_equipment set deleted_at=now(),status='retired',assigned_team_member_id=null,assigned_at=null,updated_by=$2,updated_at=now() where id=$1 and deleted_at is null returning id`,
      [id, actorKey],
    );
    if (!updated.rowCount)
      throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
    await client.query(
      `update public.admin_equipment_assignments set returned_at=now(),returned_by=$2 where equipment_id=$1 and returned_at is null`,
      [id, actorKey],
    );
    await client.query(
      `insert into public.admin_equipment_audit(equipment_id,actor_key,action) values($1,$2,'equipment.archived')`,
      [id, actorKey],
    );
    await client.query("commit");
    return NextResponse.json({ ok: true }, { headers: responseHeaders() });
  } catch (cause) {
    await client.query("rollback");
    const notFound =
      String((cause as { code?: unknown })?.code || "") === "NOT_FOUND";
    return NextResponse.json(
      {
        error: notFound
          ? "Equipment was not found."
          : "Equipment could not be archived.",
      },
      { status: notFound ? 404 : 500 },
    );
  } finally {
    client.release();
  }
}
