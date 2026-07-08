"use client";

import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Loader2, ClipboardList } from "lucide-react";
import QuestionBankEditor from "@/components/screening/QuestionBankEditor";

interface AssignedRole {
  id: string;
  title: string;
  role_type: string;
  is_active: boolean;
  question_count: number;
}

const ROLE_TYPE_LABEL: Record<string, string> = {
  "full-time": "Full-time roles",
  intern: "Intern roles",
  "part-time": "Part-time roles",
  contract: "Contract roles",
  freelance: "Freelance roles",
};
const ROLE_TYPE_ORDER = ["full-time", "intern", "part-time", "contract", "freelance"];

export default function TeamScreeningPage() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AssignedRole[]>([]);
  const [roleId, setRoleId] = useState("");

  useEffect(() => {
    fetch("/api/team/screening", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list: AssignedRole[] = d?.roles || [];
        setRoles(list);
        setRoleId((cur) => cur || (list[0]?.id ?? ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, AssignedRole[]>();
    for (const r of roles) {
      const key = r.role_type || "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.keys()]
      .sort((a, b) => {
        const ia = ROLE_TYPE_ORDER.indexOf(a), ib = ROLE_TYPE_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map((k) => ({ key: k, label: ROLE_TYPE_LABEL[k] || "Other roles", roles: map.get(k)! }));
  }, [roles]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-brand-navy tracking-tight">Screening Questions</h1>
          <p className="text-sm text-brand-body/70">Set the objective test questions for the role(s) you&apos;ve been assigned.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
        </div>
      ) : roles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-stroke bg-white py-16 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-brand-mute" />
          <p className="text-sm font-semibold text-brand-navy">No roles assigned to you yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-brand-body/60">
            An admin can assign you to set a role&apos;s screening questions. Once they do, the role appears here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-2">
            <label className="text-sm font-medium text-brand-body/70">Role:</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="rounded-xl border border-brand-stroke bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-blue"
            >
              {grouped.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {!r.is_active ? " (draft)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {roleId && (
            <QuestionBankEditor
              roleId={roleId}
              loadUrl={(rid) => `/api/team/screening/questions?role_id=${rid}`}
              saveUrl="/api/team/screening/questions"
            />
          )}
        </>
      )}
    </div>
  );
}
