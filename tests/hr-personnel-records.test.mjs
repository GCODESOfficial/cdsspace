import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("HR migration creates private, auditable personnel records and birthday reminders", async () => {
  const sql = await read("glashdb/migrations/20261003_hr_personnel_records.sql");
  assert.match(sql, /create table if not exists public\.hr_personnel_records/);
  assert.match(sql, /create table if not exists public\.hr_personnel_record_events/);
  assert.match(sql, /create table if not exists public\.hr_personnel_record_drafts/);
  assert.match(sql, /date_of_birth date/);
  assert.match(sql, /birthday_reminder_days between 1 and 90/);
  assert.match(sql, /finance_employees\(team_member_id\)/);
  assert.match(sql, /'hr-personnel',[\s\S]*false/);
  assert.match(sql, /storage_path text unique/);
});

test("member dossier aggregates access, work, group, payroll, and HR history", async () => {
  const [api, page] = await Promise.all([
    read("src/app/api/admin/team-members/[id]/profile/route.ts"),
    read("src/components/hrm/TeamMemberDossier.tsx"),
  ]);
  assert.match(api, /team_device_sessions/);
  assert.match(api, /team_time_entries/);
  assert.match(api, /team_chat_participants/);
  assert.match(api, /finance_payroll_items/);
  assert.match(api, /hr_personnel_records/);
  assert.match(api, /team_face_profiles/);
  assert.match(api, /admin_equipment/);
  assert.match(api, /hr_compliance\.financial/);
  assert.match(page, /Access and devices/);
  assert.match(page, /Salary and payment history/);
  assert.match(page, /Birthday reminder/);
  assert.match(page, /Personnel documents and actions/);
  assert.match(page, /Assigned equipment/);
  assert.match(page, /Face verification/);
});

test("HR files are malware checked, privately stored, and permission streamed", async () => {
  const [storage, upload, file] = await Promise.all([
    read("src/lib/hr-personnel-storage.ts"),
    read("src/app/api/admin/hr/compliance/upload/route.ts"),
    read("src/app/api/admin/hr/compliance/file/[id]/route.ts"),
  ]);
  assert.match(storage, /assertSafeUpload/);
  assert.match(storage, /allow: \["pdf", "office", "image"\]/);
  assert.match(upload, /requireAdmin\(req, "hr_compliance\.manage"\)/);
  assert.match(file, /requireAdmin\(req, "hr_compliance\.view"\)/);
  assert.match(file, /Cache-Control": "private, no-store"/);
  assert.match(file, /X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(file, /getPublicUrl/);
});

test("invoice notice uses the approved polite wording", async () => {
  const page = await read("src/app/invoice/[token]/PublicInvoiceClient.tsx");
  assert.match(page, /This invoice remains valid for \{INVOICE_VALID_DAYS\} days from the date it was issued\./);
  assert.match(page, /We kindly ask that/);
  assert.match(page, /we will be happy to help/);
  assert.doesNotMatch(page, /cancelled automatically/);
  assert.doesNotMatch(page, /new invoice to proceed/);
});
