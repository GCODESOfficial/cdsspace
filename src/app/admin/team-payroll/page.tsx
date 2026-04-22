"use client";

import { Wallet } from "lucide-react";
import { WorkspacePlaceholder } from "@/components/admin/WorkspacePlaceholder";

export default function AdminTeamPayrollPage() {
  return (
    <WorkspacePlaceholder
      title="Team Payroll"
      description="Create, approve, and track payroll entries for every team member."
      icon={Wallet}
      tables={["team_payroll_entries", "team_members"]}
      capabilities={[
        "Create monthly, weekly, bi-weekly, or one-off payroll entries",
        "Approve pending entries, mark as paid with a payment reference",
        "Bulk-create entries for a whole department in one run",
        "Export full payroll history as CSV",
        "Per-entry notifications fire to the team member",
      ]}
      teamLink={{ href: "/team/payroll", label: "Open team view" }}
    />
  );
}
