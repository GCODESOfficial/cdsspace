/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fieldLabels } from "@/utils/questionLabels";
import {
  Search,
  Download,
  Eye,
  X,
  Users,
  Filter,
  Archive,
  ArchiveRestore,
  UserCheck,
  Tag,
  Trash2,
} from "lucide-react";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

const ASSIGNABLE_ROLES = [
  "Creative Designer",
  "UI/UX Designer",
  "Customer Relations Personnel",
  "Office Cleaner",
  "Print Production Assistant",
  "Administrative Assistant",
];

const STATUS_FILTERS = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

function getFieldValue(row: any, key: string) {
  if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  return row?.fields?.[key] ?? "—";
}

function getApplicantName(row: any) {
  return String(getFieldValue(row, "legal_name") ?? "Unnamed applicant");
}

function getApplicantEmail(row: any) {
  return String(getFieldValue(row, "email") ?? "—");
}

function getApplicantRole(row: any) {
  return String(getFieldValue(row, "role") ?? "Not specified");
}

function isArchived(row: any) {
  return Boolean(row?.is_archived);
}

export default function AdminTablePage() {
  const [data, setData] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewItem, setViewItem] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [showRoleAssign, setShowRoleAssign] = useState(false);
  const [includeArchivedInSearch, setIncludeArchivedInSearch] = useState(false);

  const refetch = async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setData(data);
  };

  useEffect(() => {
    refetch();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return data.filter((row) => {
      const applicantName = getApplicantName(row).toLowerCase();
      const applicantEmail = getApplicantEmail(row).toLowerCase();
      const applicantRole = getApplicantRole(row).toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        applicantName.includes(normalizedSearch) ||
        applicantEmail.includes(normalizedSearch) ||
        applicantRole.includes(normalizedSearch);

      const matchesRole =
        roleFilter === "all" || applicantRole.includes(roleFilter.toLowerCase());

      const rowArchived = isArchived(row);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "archived" && rowArchived) ||
        (statusFilter === "active" &&
          (!rowArchived || (Boolean(normalizedSearch) && includeArchivedInSearch)));

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [data, includeArchivedInSearch, roleFilter, search, statusFilter]);

  const roleFilters = useMemo(() => {
    const roles = new Set<string>();

    data.forEach((row) => {
      const role = getApplicantRole(row);
      if (role && role !== "Not specified" && role !== "—") {
        roles.add(role);
      }
    });

    ASSIGNABLE_ROLES.forEach((role) => roles.add(role));

    return [
      { key: "all", label: "All Roles" },
      ...Array.from(roles)
        .sort((first, second) => first.localeCompare(second))
        .map((role) => ({ key: role.toLowerCase(), label: role })),
    ];
  }, [data]);

  const activeCount = data.filter((row) => !isArchived(row)).length;
  const archivedCount = data.filter((row) => isArchived(row)).length;

  const toggleSelect = (id: number) => {
    const copy = new Set(selected);
    copy.has(id) ? copy.delete(id) : copy.add(id);
    setSelected(copy);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((row) => row.id)));
    }
  };

  const selectedRows = data.filter((row) => selected.has(row.id));
  const hasArchivedSelection = selectedRows.some((row) => isArchived(row));
  const hasActiveSelection = selectedRows.some((row) => !isArchived(row));

  const clearSelection = () => {
    setSelected(new Set());
    setShowRoleAssign(false);
  };

  const downloadCSV = () => {
    const headers = ["created_at", "archived_at", "is_archived", ...Object.keys(fieldLabels)];
    const csvRows: string[] = [];

    csvRows.push(
      headers
        .map((key) => {
          if (key === "created_at") return '"Submitted At"';
          if (key === "archived_at") return '"Archived At"';
          if (key === "is_archived") return '"Archived"';
          return `"${fieldLabels[key]}"`;
        })
        .join(",")
    );

    selectedRows.forEach((row) => {
      const values = headers.map((key) => {
        let value: unknown;
        if (key === "created_at" || key === "archived_at" || key === "is_archived") {
          value = row[key];
        } else {
          value = getFieldValue(row, key);
        }

        return value !== undefined && value !== null
          ? `"${String(value).replace(/"/g, '""')}"`
          : "";
      });

      csvRows.push(values.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "applicants.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const bulkDelete = async () => {
    if (!(await appConfirm(`Delete ${selected.size} applicant(s)? This cannot be undone.`))) return;

    const ids = Array.from(selected);
    const { error } = await supabase.from("applications").delete().in("id", ids);

    if (!error) {
      clearSelection();
      await refetch();
    }
  };

  const bulkAssignRole = async (role: string) => {
    const ids = Array.from(selected);
    const { error } = await supabase.from("applications").update({ role }).in("id", ids);

    if (!error) {
      clearSelection();
      await refetch();
    }
  };

  const bulkArchive = async () => {
    if (!selected.size) return;

    const ids = Array.from(selected);
    const { error } = await supabase
      .from("applications")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .in("id", ids);

    if (!error) {
      clearSelection();
      await refetch();
    }
  };

  const bulkUnarchive = async () => {
    if (!selected.size) return;

    const ids = Array.from(selected);
    const { error } = await supabase
      .from("applications")
      .update({ is_archived: false, archived_at: null })
      .in("id", ids);

    if (!error) {
      clearSelection();
      await refetch();
    }
  };

  const toggleArchiveState = async (row: any) => {
    const nextArchivedState = !isArchived(row);

    const { error } = await supabase
      .from("applications")
      .update({
        is_archived: nextArchivedState,
        archived_at: nextArchivedState ? new Date().toISOString() : null,
      })
      .eq("id", row.id);

    if (!error) {
      if (viewItem?.id === row.id) {
        setViewItem({
          ...viewItem,
          is_archived: nextArchivedState,
          archived_at: nextArchivedState ? new Date().toISOString() : null,
        });
      }
      await refetch();
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const normalizedRole = role?.toLowerCase() || "";
    if (normalizedRole.includes("intern")) return "bg-purple-50 text-purple-600";
    if (normalizedRole.includes("full")) return "bg-blue-50 text-[#0A4FE8]";
    if (normalizedRole.includes("part")) return "bg-amber-50 text-amber-600";
    if (normalizedRole.includes("contract")) return "bg-emerald-50 text-emerald-600";
    if (normalizedRole.includes("freelance")) return "bg-cyan-50 text-cyan-600";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="p-8 max-w-[1280px]">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Team</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Applicants</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 text-[#0A4FE8] text-sm font-medium flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {activeCount} active
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> {archivedCount} archived
          </div>

          {selected.size > 0 && (
            <div className="relative">
              <BulkActionBar
                selectedCount={selected.size}
                onClear={clearSelection}
                actions={[
                  { label: "Assign Role", icon: <Tag className="w-4 h-4" />, onClick: () => setShowRoleAssign((value) => !value) },
                  ...(hasActiveSelection
                    ? [{ label: "Archive", icon: <Archive className="w-4 h-4" />, onClick: bulkArchive }]
                    : []),
                  ...(hasArchivedSelection
                    ? [{ label: "Restore", icon: <ArchiveRestore className="w-4 h-4" />, onClick: bulkUnarchive }]
                    : []),
                  { label: "Export CSV", icon: <Download className="w-4 h-4" />, onClick: downloadCSV },
                  { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: bulkDelete, variant: "danger" },
                ]}
              />

              {showRoleAssign && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg py-2 w-48 z-50">
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Assign Role</p>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <button
                      key={role}
                      onClick={() => bulkAssignRole(role)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-[#0A4FE8] transition flex items-center gap-2"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {role}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            />
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-600">
            <input
              type="checkbox"
              checked={includeArchivedInSearch}
              onChange={(event) => setIncludeArchivedInSearch(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200"
            />
            Include archived in search
          </label>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-gray-400 mr-1" />
            {roleFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setRoleFilter(filter.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                  roleFilter === filter.key
                    ? "bg-[#0A4FE8] text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200 hover:text-[#0A4FE8]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                  statusFilter === filter.key
                    ? "bg-[#0D1B39] text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-[#0D1B39]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-3 bg-[#FBFCFF] border-b border-gray-100 text-[12px] text-gray-500 flex items-center justify-between gap-3 flex-wrap">
          <span>
            Showing <span className="font-semibold text-[#0D1B39]">{filtered.length}</span> applicant{filtered.length === 1 ? "" : "s"}
          </span>
          {search.trim() && includeArchivedInSearch && statusFilter === "active" && (
            <span className="text-[#0A4FE8]">Archived matches can appear in these search results.</span>
          )}
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-2.5 px-6 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200 cursor-pointer"
                />
              </th>
              <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Full Name</th>
              <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Role</th>
              <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Email</th>
              <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
              <th className="text-right py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-gray-400 text-sm">No applicants found</td>
              </tr>
            ) : (
              filtered.map((row) => {
                const applicantRole = getApplicantRole(row);
                const applicantArchived = isArchived(row);

                return (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                    <td className="py-3 px-6">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-[#0D1B39]">{getApplicantName(row)}</span>
                        {applicantArchived && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            <Archive className="w-3 h-3" />
                            Archived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-medium ${getRoleBadgeColor(applicantRole)}`}>
                        {applicantRole}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[13px] text-gray-500">{getApplicantEmail(row)}</td>
                    <td className="py-3 px-3 text-[13px] text-gray-400">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleArchiveState(row)}
                          className={`p-1.5 rounded-md transition ${
                            applicantArchived
                              ? "text-emerald-600 hover:bg-emerald-50"
                              : "text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                          }`}
                          title={applicantArchived ? "Restore applicant" : "Archive applicant"}
                        >
                          {applicantArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setViewItem(row)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {viewItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[540px] max-h-[80vh] overflow-hidden mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-[#0D1B39]">Applicant Details</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    isArchived(viewItem) ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {isArchived(viewItem) ? "Archived" : "Active"}
                </span>
              </div>

              <button onClick={() => setViewItem(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(80vh-64px)] p-6 space-y-3">
              {Object.keys(fieldLabels).map((key) => (
                <div key={key} className="flex text-sm">
                  <span className="w-44 flex-shrink-0 text-gray-400 font-medium">{fieldLabels[key]}</span>
                  <span className="text-[#0D1B39]">{String(getFieldValue(viewItem, key) ?? "—")}</span>
                </div>
              ))}

              {viewItem.archived_at && (
                <div className="flex text-sm pt-2 border-t border-gray-100">
                  <span className="w-44 flex-shrink-0 text-gray-400 font-medium">Archived At</span>
                  <span className="text-[#0D1B39]">{new Date(viewItem.archived_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
