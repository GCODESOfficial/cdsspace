import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * The custody agreement a team member signs for a device assigned to them.
 *
 * Assigning equipment used to leave nothing on record but the assignment row.
 * Each assignment now raises this agreement, and the signed copy keeps the
 * exact wording accepted, so a later edit here cannot change what was agreed.
 * Raise the version whenever the wording changes.
 */
export const EQUIPMENT_CUSTODY_VERSION = "1.0";
export const EQUIPMENT_CUSTODY_EFFECTIVE_DATE = "2026-09-14";

export type CustodyDevice = {
  asset_tag: string;
  name: string;
  equipment_type_name?: string | null;
  serial_number?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  condition?: string | null;
  purchase_cost?: string | number | null;
  currency?: string | null;
};

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  needs_repair: "Needs repair",
  retired: "Retired",
};

function money(device: CustodyDevice) {
  const amount = Number(device.purchase_cost);
  if (!Number.isFinite(amount) || amount <= 0) return "not recorded";
  return `${device.currency || "NGN"} ${amount.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export function equipmentCustodyText(input: {
  device: CustodyDevice;
  memberName: string;
  assignedAt: string | Date;
}) {
  const device = input.device;
  const handedOver = new Date(input.assignedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const details = [
    `Asset tag: ${device.asset_tag}`,
    `Device: ${device.name}${device.equipment_type_name ? ` (${device.equipment_type_name})` : ""}`,
    device.manufacturer || device.model ? `Make and model: ${[device.manufacturer, device.model].filter(Boolean).join(" ")}` : null,
    `Serial number: ${device.serial_number || "not recorded"}`,
    `Condition at handover: ${CONDITION_LABEL[String(device.condition)] || "not recorded"}`,
    `Recorded value: ${money(device)}`,
    `Assigned on: ${handedOver}`,
  ].filter(Boolean).join("\n");

  return `CDS SPACE EQUIPMENT CUSTODY AND RESPONSIBILITY AGREEMENT
Version ${EQUIPMENT_CUSTODY_VERSION}, effective ${EQUIPMENT_CUSTODY_EFFECTIVE_DATE}

DEVICE
${details}

CUSTODIAN
${input.memberName}

1. Custody. I confirm that I have received the device described above from CDS Space and that it is in the condition recorded. I take sole custody of it from the date of assignment until it is formally returned to CDS Space and the return is recorded.

2. Ownership. The device remains the property of CDS Space at all times. Signing this agreement gives me no ownership interest in it. I will not sell, lend, pledge, modify or dispose of it, and I will not give it to anyone else without written approval from CDS Space.

3. Responsibility for damage and loss. I accept full responsibility for the device while it is in my custody. If it is lost, stolen or damaged beyond fair wear and tear during that time, I am responsible for its repair or replacement, at the recorded value above or the current replacement cost, whichever CDS Space reasonably determines. This applies whether the loss or damage happens at the office, at home, in transit or anywhere else.

4. Care and use. I will keep the device secure, use it for work purposes in line with company policy, keep it free of unlawful or unlicensed material, and apply the security settings CDS Space requires. I will not remove asset tags or company software.

5. Reporting. I will report any loss, theft, damage or fault to CDS Space without delay, and I will report a theft to the police where CDS Space asks me to.

6. Return. I will return the device, with its accessories, on request or on my last working day, whichever comes first. If I do not, CDS Space may recover its value from any amount owed to me, to the extent the law allows.

7. Fair wear and tear. Normal wear from ordinary working use is expected and is not treated as damage under clause 3.

I have read this agreement and I sign it freely, accepting custody of the device and responsibility for its loss or damage while it is with me.`;
}

/**
 * Raises the pending agreement for a new assignment. Called inside the same
 * transaction as the assignment, so a device is never handed over without one.
 */
export async function createPendingCustodyAgreement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { query: (text: string, values?: unknown[]) => Promise<any> },
  input: { equipmentId: string; assignmentId: string; teamMemberId: string; memberName: string; assignedAt: string; device: CustodyDevice },
) {
  const text = equipmentCustodyText({
    device: input.device,
    memberName: input.memberName,
    assignedAt: input.assignedAt,
  });
  await client.query(
    `insert into public.admin_equipment_custody_agreements
       (equipment_id, assignment_id, team_member_id, agreement_version, agreement_text, device_snapshot)
     values ($1,$2,$3,$4,$5,$6::jsonb)
     on conflict (assignment_id) do nothing`,
    [input.equipmentId, input.assignmentId, input.teamMemberId, EQUIPMENT_CUSTODY_VERSION, text, JSON.stringify(input.device)],
  );
}

/** Devices a team member holds, with the state of each custody agreement. */
export async function listMemberCustodyAgreements(teamMemberId: string) {
  return glashQuery<Record<string, unknown>>(
    `select c.id, c.status, c.agreement_version, c.agreement_text, c.signer_name, c.signed_at,
            c.declined_at, c.decline_reason, c.created_at,
            e.asset_tag, e.name as device_name, e.serial_number, e.manufacturer, e.model,
            t.name as equipment_type_name, a.assigned_at, a.returned_at, a.assignment_note
       from public.admin_equipment_custody_agreements c
       join public.admin_equipment e on e.id = c.equipment_id
       join public.admin_equipment_types t on t.id = e.equipment_type_id
       join public.admin_equipment_assignments a on a.id = c.assignment_id
      where c.team_member_id = $1::uuid and a.returned_at is null and e.deleted_at is null
      order by (c.status = 'pending') desc, c.created_at desc`,
    [teamMemberId],
  );
}
