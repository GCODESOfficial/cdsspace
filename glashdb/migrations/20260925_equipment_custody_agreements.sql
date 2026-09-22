-- Custody agreements for assigned equipment.
--
-- A device could be handed to a team member with nothing on record beyond an
-- assignment row, so nobody had accepted responsibility for it in writing. Loss
-- or damage then came down to memory. Every assignment now raises an agreement
-- the assignee signs, accepting custody of that device and responsibility for
-- damage or loss while it is with them.
--
-- One agreement per assignment: a device returned and reissued, or passed to
-- someone else, must be signed for again. The signed copy keeps the exact text
-- accepted, so later edits to the wording cannot change what was agreed.

begin;

create table if not exists public.admin_equipment_custody_agreements (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.admin_equipment(id) on delete cascade,
  assignment_id uuid not null unique references public.admin_equipment_assignments(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'signed', 'declined')),
  agreement_version text not null,
  -- The wording exactly as shown to the signer, kept for evidence.
  agreement_text text not null,
  -- A snapshot of the device: asset tag, name, serial, value at handover.
  device_snapshot jsonb not null default '{}'::jsonb,
  signer_name text,
  -- The drawn signature, stored as a PNG data URL, as cSign does.
  signature_image text,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  -- A signed agreement must carry who signed it and when.
  constraint admin_equipment_custody_signed_complete check (
    status <> 'signed' or (signed_at is not null and signer_name is not null and signature_image is not null)
  )
);

comment on table public.admin_equipment_custody_agreements is
  'Signed acceptance of custody and responsibility for an assigned device. One per assignment.';

create index if not exists admin_equipment_custody_member_idx
  on public.admin_equipment_custody_agreements (team_member_id, status, created_at desc);
create index if not exists admin_equipment_custody_equipment_idx
  on public.admin_equipment_custody_agreements (equipment_id, created_at desc);

-- Server-side only, like the rest of the equipment tables.
alter table public.admin_equipment_custody_agreements enable row level security;
revoke all on public.admin_equipment_custody_agreements from anon, authenticated;

commit;
