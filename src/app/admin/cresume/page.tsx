"use client";

 

import { useEffect, useState } from "react";
import Link from "next/link";
import { initials } from "@/lib/utils";
import { UserRound, Loader2, Eye, Link2 } from "lucide-react";

interface Member {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role_title: string | null;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export default function AdminCResumePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/admin/team-members").then((r) => r.json()).then((j) => {
      if (j.ok) setMembers(j.members);
      setLoading(false);
    });
  }, []);
  return (
    <div className="p-8 max-w-[1100px]">
      <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>
      <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">cResume</h1>
      <p className="text-gray-400 text-[13px] mt-1 mb-6">Team member public profiles. Share a teammate&apos;s one-pager.</p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {members.map((m) => (
              <li key={m.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0A4FE8] text-white font-bold flex items-center justify-center">{initials(m.full_name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{m.full_name}</p>
                  <p className="text-[11px] text-gray-400">@{m.username}{m.role_title && ` · ${m.role_title}`}{m.department && ` · ${m.department}`}</p>
                </div>
                <Link href={`/${m.username}`} target="_blank" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#0A4FE8]/30 text-[#0A4FE8] text-[11.5px] font-medium hover:bg-blue-50">
                  <Eye className="w-3.5 h-3.5" /> Open public resume
                </Link>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/${m.username}`)} className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Copy public URL">
                  <Link2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
