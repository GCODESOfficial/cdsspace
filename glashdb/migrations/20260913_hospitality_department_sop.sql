begin;

insert into public.team_compliance_sops
  (sop_number, title, summary, content, scope_type, department, status, created_by, updated_by, published_at)
values (
  'CDS-DPT-013',
  'Hospitality department operating procedure',
  'The standard for receiving guests, preparing shared spaces, supporting meetings, protecting facilities, and escalating workplace service or safety concerns.',
  $sop$1. Review the day’s visitor, meeting, event, facility, refreshment, and special-support schedule before service begins.
2. Prepare reception, meeting rooms, shared areas, washrooms, equipment, signage, water, and approved refreshments to the required standard.
3. Receive every guest professionally, confirm their host or appointment, follow access rules, and never disclose private staff, client, or office information.
4. Notify the host promptly, direct the guest only to authorised areas, and record the visit where the visitor-control process requires it.
5. Support cMeet, consultations, client sessions, and internal meetings with the agreed room setup without interrupting confidential discussions.
6. Check shared spaces throughout the day and report maintenance, hygiene, stock, access, equipment, or safety issues immediately.
7. Record consumables used, shortages, damages, lost property, unusual behaviour, and required procurement or facilities follow-up.
8. Before closing, restore rooms, secure equipment and access points, dispose of sensitive waste correctly, and hand unresolved issues to Operations and Management.

Evidence: visitor or room record where required, setup checklist, stock or issue report, escalation record, and closing handoff.$sop$,
  'department',
  'Hospitality',
  'published',
  'CDS Space system',
  'CDS Space system',
  now()
)
on conflict (sop_number) do nothing;

insert into public.team_compliance_sop_assignments
  (sop_id, audience_type, department, assigned_by)
select id, 'department', 'Hospitality', 'CDS Space system'
from public.team_compliance_sops
where sop_number = 'CDS-DPT-013'
on conflict do nothing;

commit;
