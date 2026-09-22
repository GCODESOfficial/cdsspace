"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  HardDrive,
  History,
  Laptop,
  Loader2,
  MonitorCog,
  PackageCheck,
  Pencil,
  PenLine,
  Plus,
  Receipt,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";

type EquipmentType = { id: string; name: string; description: string | null };
type Member = {
  id: string;
  full_name: string;
  role_title: string | null;
  department: string | null;
};
type Equipment = {
  id: string;
  asset_tag: string;
  name: string;
  equipment_type_id: string;
  equipment_type_name: string;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  condition: string;
  status: string;
  location: string | null;
  purchase_date: string | null;
  purchase_cost: string | number | null;
  currency: string;
  warranty_expires_at: string | null;
  notes: string | null;
  receipt_file_name: string | null;
  receipt_content_type: string | null;
  receipt_size_bytes: number | null;
  assigned_team_member_id: string | null;
  assigned_at: string | null;
  assigned_team_member_name: string | null;
  custody_status: "pending" | "signed" | "declined" | null;
  custody_signed_at: string | null;
  custody_signer_name: string | null;
  custody_version: string | null;
  has_password: boolean;
  created_at: string;
  updated_at: string;
};
type Assignment = {
  id: string;
  equipment_id: string;
  team_member_id: string;
  team_member_name: string;
  assigned_at: string;
  returned_at: string | null;
  assignment_note: string | null;
};
type ReceiptDraft = {
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};
type FormState = {
  assetTag: string;
  name: string;
  equipmentTypeId: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  condition: string;
  status: string;
  location: string;
  purchaseDate: string;
  purchaseCost: string;
  currency: string;
  warrantyExpiresAt: string;
  notes: string;
  assignedTeamMemberId: string;
  assignedAt: string;
  assignmentNote: string;
  password: string;
  clearPassword: boolean;
  receiptStoragePath: string;
  receiptFileName: string;
  receiptContentType: string;
  receiptSizeBytes: number | null;
};

const EMPTY: FormState = {
  assetTag: "",
  name: "",
  equipmentTypeId: "",
  serialNumber: "",
  manufacturer: "",
  model: "",
  condition: "good",
  status: "available",
  location: "",
  purchaseDate: "",
  purchaseCost: "",
  currency: "NGN",
  warrantyExpiresAt: "",
  notes: "",
  assignedTeamMemberId: "",
  assignedAt: "",
  assignmentNote: "",
  password: "",
  clearPassword: false,
  receiptStoragePath: "",
  receiptFileName: "",
  receiptContentType: "",
  receiptSizeBytes: null,
};

const STATUS = [
  { key: "available", label: "Available" },
  { key: "assigned", label: "Assigned" },
  { key: "maintenance", label: "Maintenance" },
  { key: "retired", label: "Retired" },
  { key: "lost", label: "Lost" },
];
const CONDITIONS = [
  { key: "new", label: "New" },
  { key: "good", label: "Good" },
  { key: "fair", label: "Fair" },
  { key: "needs_repair", label: "Needs repair" },
  { key: "retired", label: "Retired" },
];
const STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700",
  assigned: "bg-blue-50 text-[#0A4FE8]",
  maintenance: "bg-amber-50 text-amber-700",
  retired: "bg-slate-100 text-slate-600",
  lost: "bg-rose-50 text-rose-700",
};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function bytes(value: number | null) {
  if (!value) return "";
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(value / 1024)} KB`;
}

export default function EquipmentInventoryPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [serverDraft, setServerDraft] = useState<Partial<FormState> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [historyEquipment, setHistoryEquipment] = useState<Equipment | null>(
    null,
  );
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draftState, setDraftState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const receiptRef = useRef<HTMLInputElement | null>(null);
  const draftReady = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/equipment", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(
          json.error || "Equipment inventory could not be loaded.",
        );
      setEquipment(json.equipment || []);
      setTypes(json.types || []);
      setMembers(json.members || []);
      setAssignments(json.assignments || []);
      setServerDraft(json.draft || null);
    } catch (error) {
      await appAlert({
        title: "Equipment inventory",
        message:
          error instanceof Error ? error.message : "Could not load inventory.",
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formOpen || editing || !draftReady.current) return;
    setDraftState("saving");
    const timer = window.setTimeout(async () => {
      const {
        password: _password,
        clearPassword: _clearPassword,
        ...safeDraft
      } = form;
      void _password;
      void _clearPassword;
      try {
        const response = await fetch("/api/admin/equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_draft", payload: safeDraft }),
        });
        setDraftState(response.ok ? "saved" : "error");
      } catch {
        setDraftState("error");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [form, formOpen, editing]);

  function openCreate() {
    const restored = serverDraft
      ? { ...EMPTY, ...serverDraft, password: "", clearPassword: false }
      : EMPTY;
    setEditing(null);
    setForm(restored);
    setFormOpen(true);
    setDraftState(serverDraft ? "saved" : "idle");
    window.setTimeout(() => {
      draftReady.current = true;
    }, 0);
  }

  function openEdit(item: Equipment) {
    draftReady.current = false;
    setEditing(item);
    setForm({
      ...EMPTY,
      assetTag: item.asset_tag,
      name: item.name,
      equipmentTypeId: item.equipment_type_id,
      serialNumber: item.serial_number || "",
      manufacturer: item.manufacturer || "",
      model: item.model || "",
      condition: item.condition,
      status: item.status,
      location: item.location || "",
      purchaseDate: item.purchase_date?.slice(0, 10) || "",
      purchaseCost:
        item.purchase_cost === null ? "" : String(item.purchase_cost),
      currency: item.currency,
      warrantyExpiresAt: item.warranty_expires_at?.slice(0, 10) || "",
      notes: item.notes || "",
      assignedTeamMemberId: item.assigned_team_member_id || "",
      assignedAt: localDateTime(item.assigned_at),
      receiptFileName: item.receipt_file_name || "",
      receiptContentType: item.receipt_content_type || "",
      receiptSizeBytes: item.receipt_size_bytes,
    });
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    draftReady.current = false;
    setFormOpen(false);
  }
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "assignedTeamMemberId") {
        next.status = value
          ? "assigned"
          : current.status === "assigned"
            ? "available"
            : current.status;
        if (value && !next.assignedAt)
          next.assignedAt = localDateTime(new Date().toISOString());
      }
      return next;
    });
  }

  async function uploadReceipt(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/admin/equipment/receipt", {
        method: "POST",
        body,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Receipt upload failed.");
      const receipt = json.receipt as ReceiptDraft;
      setForm((current) => ({
        ...current,
        receiptStoragePath: receipt.storagePath,
        receiptFileName: receipt.fileName,
        receiptContentType: receipt.contentType,
        receiptSizeBytes: receipt.sizeBytes,
      }));
      appToast({ message: "Receipt uploaded securely.", kind: "success" });
    } catch (error) {
      await appAlert({
        title: "Receipt upload",
        message: error instanceof Error ? error.message : "Upload failed.",
        kind: "error",
      });
    } finally {
      setUploading(false);
      if (receiptRef.current) receiptRef.current.value = "";
    }
  }

  async function save() {
    if (!form.assetTag.trim() || !form.name.trim() || !form.equipmentTypeId) {
      await appAlert({
        title: "Complete required fields",
        message: "Asset tag, equipment name and equipment type are required.",
        kind: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/equipment", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...form, id: editing.id } : form),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error || "Equipment could not be saved.");
      draftReady.current = false;
      setFormOpen(false);
      setServerDraft(null);
      appToast({
        message: editing ? "Equipment updated." : "Equipment added.",
        kind: "success",
      });
      await load();
    } catch (error) {
      await appAlert({
        title: "Save equipment",
        message:
          error instanceof Error ? error.message : "Could not save equipment.",
        kind: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function archive(item: Equipment) {
    if (
      !(await appConfirm({
        title: "Archive equipment?",
        message: `${item.name} will leave the active inventory. Its assignment history remains available for audit.`,
        confirmLabel: "Archive",
        destructive: true,
      }))
    )
      return;
    const response = await fetch(
      `/api/admin/equipment?id=${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
    );
    const json = await response.json().catch(() => ({}));
    if (!response.ok)
      return appAlert({
        title: "Archive equipment",
        message: json.error || "Could not archive equipment.",
        kind: "error",
      });
    appToast({ message: "Equipment archived.", kind: "success" });
    await load();
  }

  async function revealPassword(item: Equipment) {
    if (revealed[item.id]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      return;
    }
    const response = await fetch("/api/admin/equipment/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok)
      return appAlert({
        title: "Equipment password",
        message: json.error || "Password could not be revealed.",
        kind: "error",
      });
    setRevealed((current) => ({ ...current, [item.id]: json.password }));
    window.setTimeout(
      () =>
        setRevealed((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        }),
      30_000,
    );
  }

  const filtered = useMemo(
    () =>
      equipment.filter((item) => {
        if (statusFilter !== "all" && item.status !== statusFilter)
          return false;
        if (typeFilter !== "all" && item.equipment_type_id !== typeFilter)
          return false;
        const haystack = [
          item.asset_tag,
          item.name,
          item.serial_number,
          item.manufacturer,
          item.model,
          item.location,
          item.assigned_team_member_name,
          item.equipment_type_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.trim().toLowerCase());
      }),
    [equipment, search, statusFilter, typeFilter],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        ["available", "assigned", "maintenance", "retired", "lost"].map(
          (status) => [
            status,
            equipment.filter((item) => item.status === status).length,
          ],
        ),
      ),
    [equipment],
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold text-[#0A4FE8]">Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0D1B39] sm:text-[28px]">
            Equipment inventory
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-500">
            Track company systems, receipts, encrypted credentials and the team
            members responsible for them.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTypeOpen(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" /> Manage types
          </button>
          <button
            onClick={openCreate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(10,79,232,0.22)] hover:bg-[#083FC0]"
          >
            <Plus className="h-4 w-4" /> Add equipment
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Summary
          label="Total equipment"
          value={equipment.length}
          icon={HardDrive}
          tone="blue"
        />
        <Summary
          label="Assigned"
          value={counts.assigned || 0}
          icon={UserRound}
          tone="navy"
        />
        <Summary
          label="Available"
          value={counts.available || 0}
          icon={PackageCheck}
          tone="green"
        />
        <Summary
          label="Maintenance"
          value={counts.maintenance || 0}
          icon={MonitorCog}
          tone="amber"
        />
        <Summary
          label="Equipment types"
          value={types.length}
          icon={Laptop}
          tone="slate"
        />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-blue-300 focus-within:bg-white">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search asset tag, serial number, equipment or assignee"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          <Filter
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ key: "all", label: "All statuses" }, ...STATUS]}
          />
          <Filter
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { key: "all", label: "All types" },
              ...types.map((type) => ({ key: type.id, label: type.name })),
            ]}
          />
        </div>
        {loading ? (
          <div className="grid min-h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty onAdd={openCreate} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1080px] text-left">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Equipment</th>
                    <th className="px-4 py-3.5">Type and serial</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Assigned to</th>
                    <th className="px-4 py-3.5">Location</th>
                    <th className="px-4 py-3.5">Receipt / password</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <EquipmentRow
                      key={item.id}
                      item={item}
                      password={revealed[item.id]}
                      onReveal={() => void revealPassword(item)}
                      onEdit={() => openEdit(item)}
                      onHistory={() => setHistoryEquipment(item)}
                      onArchive={() => void archive(item)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 lg:hidden">
              {filtered.map((item) => (
                <EquipmentCard
                  key={item.id}
                  item={item}
                  password={revealed[item.id]}
                  onReveal={() => void revealPassword(item)}
                  onEdit={() => openEdit(item)}
                  onHistory={() => setHistoryEquipment(item)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {formOpen && (
        <EquipmentModal
          editing={editing}
          form={form}
          types={types}
          members={members}
          saving={saving}
          uploading={uploading}
          draftState={draftState}
          receiptRef={receiptRef}
          onClose={closeForm}
          onUpdate={update}
          onUpload={uploadReceipt}
          onSave={() => void save()}
        />
      )}
      {typeOpen && (
        <TypesModal
          types={types}
          onClose={() => setTypeOpen(false)}
          onChanged={load}
        />
      )}
      {historyEquipment && (
        <HistoryModal
          equipment={historyEquipment}
          assignments={assignments.filter(
            (item) => item.equipment_id === historyEquipment.id,
          )}
          onClose={() => setHistoryEquipment(null)}
        />
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof HardDrive;
  tone: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-[#0A4FE8]",
    navy: "bg-[#EEF1FA] text-[#0B1B52]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl ${colors[tone]}`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <p className="mt-3 text-2xl font-bold text-[#0D1B39]">{value}</p>
      <p className="mt-0.5 text-[12px] text-slate-500">{label}</p>
    </div>
  );
}
function Filter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-[12px] font-semibold text-slate-600 outline-none lg:w-44"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
    </div>
  );
}
function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]">
        <MonitorCog className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-[#0D1B39]">
        No equipment found
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Add the first company system or adjust your filters.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white"
      >
        Add equipment
      </button>
    </div>
  );
}

function EquipmentRow({
  item,
  password,
  onReveal,
  onEdit,
  onHistory,
  onArchive,
}: {
  item: Equipment;
  password?: string;
  onReveal: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onArchive: () => void;
}) {
  return (
    <tr className="border-t border-slate-100 text-[12px] hover:bg-slate-50/60">
      <td className="px-5 py-4">
        <p className="font-semibold text-[#0D1B39]">{item.name}</p>
        <p className="mt-0.5 font-mono text-[10px] text-[#0A4FE8]">
          {item.asset_tag}
        </p>
        {item.manufacturer && (
          <p className="mt-0.5 text-slate-400">
            {[item.manufacturer, item.model].filter(Boolean).join(" · ")}
          </p>
        )}
      </td>
      <td className="px-4 py-4">
        <p className="font-medium text-slate-700">{item.equipment_type_name}</p>
        <p className="mt-0.5 font-mono text-[10px] text-slate-400">
          {item.serial_number || "No serial number"}
        </p>
      </td>
      <td className="px-4 py-4">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLE[item.status]}`}
        >
          {STATUS.find((status) => status.key === item.status)?.label ||
            item.status}
        </span>
        <p className="mt-2 text-[10px] text-slate-400">
          {
            CONDITIONS.find((condition) => condition.key === item.condition)
              ?.label
          }
        </p>
      </td>
      <td className="px-4 py-4">
        {item.assigned_team_member_name ? (
          <>
            <p className="font-medium text-slate-700">
              {item.assigned_team_member_name}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Since {new Date(item.assigned_at!).toLocaleDateString()}
            </p>
            <CustodyBadge item={item} />
          </>
        ) : (
          <span className="text-slate-400">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-4 text-slate-600">{item.location || "Not recorded"}</td>
      <td className="px-4 py-4">
        <div className="flex flex-col items-start gap-1.5">
          {item.receipt_file_name && (
            <a
              href={`/api/admin/equipment/${item.id}/receipt`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#0A4FE8] hover:underline"
            >
              <Receipt className="h-3.5 w-3.5" />
              Receipt
            </a>
          )}
          {item.has_password && (
            <button
              onClick={onReveal}
              className="inline-flex max-w-44 items-center gap-1 text-slate-600 hover:text-[#0A4FE8]"
            >
              {password ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              <span className="truncate font-mono">
                {password || "Reveal password"}
              </span>
            </button>
          )}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-1">
          <Action
            icon={History}
            label="Assignment history"
            onClick={onHistory}
          />
          <Action icon={Pencil} label="Edit equipment" onClick={onEdit} />
          <Action
            icon={Archive}
            label="Archive equipment"
            onClick={onArchive}
            danger
          />
        </div>
      </td>
    </tr>
  );
}
/**
 * Whether the holder has signed for the device. An assignment without a signed
 * agreement is the case worth spotting, so it is the one that stands out.
 */
function custodyLabel(item: Equipment) {
  if (!item.assigned_team_member_id) return "Not needed";
  if (item.custody_status === "signed") {
    return `Signed ${item.custody_signed_at ? new Date(item.custody_signed_at).toLocaleDateString() : ""}`.trim();
  }
  if (item.custody_status === "declined") return "Declined";
  return "Awaiting signature";
}

function CustodyBadge({ item }: { item: Equipment }) {
  const signed = item.custody_status === "signed";
  const declined = item.custody_status === "declined";
  return (
    <span
      title={signed && item.custody_signer_name ? `Signed by ${item.custody_signer_name}` : undefined}
      className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        signed
          ? "bg-green-50 text-green-700"
          : declined
            ? "bg-red-50 text-red-600"
            : "bg-amber-50 text-amber-700"
      }`}
    >
      {signed ? <ShieldCheck className="h-3 w-3" /> : <PenLine className="h-3 w-3" />}
      {custodyLabel(item)}
    </span>
  );
}

function EquipmentCard({
  item,
  password,
  onReveal,
  onEdit,
  onHistory,
}: {
  item: Equipment;
  password?: string;
  onReveal: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#0D1B39]">{item.name}</p>
          <p className="mt-0.5 font-mono text-[10px] text-[#0A4FE8]">
            {item.asset_tag}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLE[item.status]}`}
        >
          {STATUS.find((status) => status.key === item.status)?.label}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <Data label="Type" value={item.equipment_type_name} />
        <Data
          label="Serial number"
          value={item.serial_number || "Not recorded"}
        />
        <Data
          label="Assigned to"
          value={item.assigned_team_member_name || "Unassigned"}
        />
        <Data
          label="Custody agreement"
          value={custodyLabel(item)}
        />
        <Data label="Location" value={item.location || "Not recorded"} />
      </dl>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {item.receipt_file_name && (
          <a
            href={`/api/admin/equipment/${item.id}/receipt`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] font-semibold text-[#0A4FE8]"
          >
            <Receipt className="h-3.5 w-3.5" />
            Receipt
          </a>
        )}
        {item.has_password && (
          <button
            onClick={onReveal}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] font-semibold text-slate-600"
          >
            {password ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            <span className="max-w-32 truncate font-mono">
              {password || "Password"}
            </span>
          </button>
        )}
        <button
          onClick={onHistory}
          className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <History className="h-4 w-4" />
        </button>
        <button
          onClick={onEdit}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
function Data({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-slate-700">{value}</dd>
    </div>
  );
}
function Action({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-lg ${danger ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600" : "text-slate-500 hover:bg-blue-50 hover:text-[#0A4FE8]"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EquipmentModal({
  editing,
  form,
  types,
  members,
  saving,
  uploading,
  draftState,
  receiptRef,
  onClose,
  onUpdate,
  onUpload,
  onSave,
}: {
  editing: Equipment | null;
  form: FormState;
  types: EquipmentType[];
  members: Member[];
  saving: boolean;
  uploading: boolean;
  draftState: string;
  receiptRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onUpload: (file: File) => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#071229]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[96dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-4xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B39]">
              {editing ? "Edit equipment" : "Add equipment"}
            </h2>
            <p
              className={`mt-0.5 text-[10px] ${draftState === "error" ? "text-rose-500" : "text-slate-400"}`}
            >
              {editing
                ? "Changes are saved when you submit."
                : draftState === "saving"
                  ? "Saving draft…"
                  : draftState === "saved"
                    ? "Draft saved"
                    : "Your unfinished form will autosave."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <section className="space-y-4">
            <SectionTitle title="Equipment details" icon={Laptop} />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Asset tag"
                required
                value={form.assetTag}
                onChange={(value) => onUpdate("assetTag", value)}
                placeholder="CDS-LAP-001"
              />
              <Input
                label="Equipment name"
                required
                value={form.name}
                onChange={(value) => onUpdate("name", value)}
                placeholder="Design laptop"
              />
            </div>
            <SelectField
              label="Equipment type"
              required
              value={form.equipmentTypeId}
              onChange={(value) => onUpdate("equipmentTypeId", value)}
              options={types.map((type) => ({
                key: type.id,
                label: type.name,
              }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Serial number"
                value={form.serialNumber}
                onChange={(value) => onUpdate("serialNumber", value)}
              />
              <Input
                label="Manufacturer"
                value={form.manufacturer}
                onChange={(value) => onUpdate("manufacturer", value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Model"
                value={form.model}
                onChange={(value) => onUpdate("model", value)}
              />
              <SelectField
                label="Condition"
                value={form.condition}
                onChange={(value) => onUpdate("condition", value)}
                options={CONDITIONS}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Status"
                value={form.status}
                onChange={(value) => onUpdate("status", value)}
                options={STATUS.filter(
                  (status) =>
                    status.key !== "assigned" || !!form.assignedTeamMemberId,
                )}
              />
              <Input
                label="Location"
                value={form.location}
                onChange={(value) => onUpdate("location", value)}
                placeholder="Lagos office"
              />
            </div>
          </section>
          <section className="space-y-4">
            <SectionTitle title="Ownership and records" icon={ShieldCheck} />
            <SelectField
              label="Team member in charge"
              value={form.assignedTeamMemberId}
              onChange={(value) => onUpdate("assignedTeamMemberId", value)}
              options={[
                { key: "", label: "Not assigned" },
                ...members.map((member) => ({
                  key: member.id,
                  label: `${member.full_name}${member.department ? ` · ${member.department}` : ""}`,
                })),
              ]}
            />
            {form.assignedTeamMemberId && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Date assigned"
                  type="datetime-local"
                  value={form.assignedAt}
                  onChange={(value) => onUpdate("assignedAt", value)}
                />
                <Input
                  label="Assignment note"
                  value={form.assignmentNote}
                  onChange={(value) => onUpdate("assignmentNote", value)}
                  placeholder="Accessories issued"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Purchase date"
                type="date"
                value={form.purchaseDate}
                onChange={(value) => onUpdate("purchaseDate", value)}
              />
              <Input
                label="Warranty expiry"
                type="date"
                value={form.warrantyExpiresAt}
                onChange={(value) => onUpdate("warrantyExpiresAt", value)}
              />
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Input
                label="Purchase cost"
                type="number"
                value={form.purchaseCost}
                onChange={(value) => onUpdate("purchaseCost", value)}
              />
              <Input
                label="Currency"
                value={form.currency}
                onChange={(value) => onUpdate("currency", value.toUpperCase())}
              />
            </div>
            <Input
              label={
                editing?.has_password
                  ? "Replace equipment password"
                  : "Equipment password"
              }
              type="password"
              value={form.password}
              onChange={(value) => onUpdate("password", value)}
              placeholder={
                editing?.has_password
                  ? "Leave blank to keep current"
                  : "Optional"
              }
            />
            {editing?.has_password && (
              <label className="flex items-center gap-2 text-[11px] text-slate-500">
                <input
                  type="checkbox"
                  checked={form.clearPassword}
                  onChange={(event) =>
                    onUpdate("clearPassword", event.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Remove stored password
              </label>
            )}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                Receipt
              </label>
              <input
                ref={receiptRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => receiptRef.current?.click()}
                disabled={uploading}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-3 text-left text-[12px] text-[#0A4FE8]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate">
                    {form.receiptFileName || "Upload receipt"}
                  </strong>
                  <small className="text-[10px] text-slate-400">
                    {form.receiptSizeBytes
                      ? bytes(form.receiptSizeBytes)
                      : "PDF, JPG, PNG or WEBP · maximum 10 MB"}
                  </small>
                </span>
              </button>
            </div>
          </section>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(event) => onUpdate("notes", event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-blue-300 focus:bg-white"
            />
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-slate-50/95 px-5 py-4 backdrop-blur">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || uploading}
            className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {editing ? "Save changes" : "Add equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}
function SectionTitle({
  title,
  icon: Icon,
}: {
  title: string;
  icon: typeof Laptop;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-[13px] font-bold text-[#0D1B39]">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0A4FE8]">
        <Icon className="h-4 w-4" />
      </span>
      {title}
    </div>
  );
}
function Input({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-300 focus:bg-white"
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { key: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-300 focus:bg-white"
      >
        <option value="">Choose an option</option>
        {options.map((option) => (
          <option key={option.key || "blank"} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TypesModal({
  types,
  onClose,
  onChanged,
}: {
  types: EquipmentType[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<EquipmentType | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) return appAlert("Enter a type name.");
    setBusy(true);
    const response = await fetch("/api/admin/equipment/types", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing?.id, name, description }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok)
      return appAlert({
        title: "Equipment type",
        message: json.error || "Could not save type.",
        kind: "error",
      });
    setName("");
    setDescription("");
    setEditing(null);
    await onChanged();
  }
  async function remove(type: EquipmentType) {
    if (
      !(await appConfirm({
        title: "Delete equipment type?",
        message: `Delete ${type.name}? Types currently used by equipment cannot be deleted.`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    const response = await fetch(`/api/admin/equipment/types?id=${type.id}`, {
      method: "DELETE",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok)
      return appAlert({
        title: "Equipment type",
        message: json.error || "Could not delete type.",
        kind: "error",
      });
    await onChanged();
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#071229]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B39]">
              Equipment types
            </h2>
            <p className="text-[12px] text-slate-500">
              Create and maintain reusable equipment categories.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Type name"
              value={name}
              onChange={setName}
              placeholder="Laptop"
            />
            <Input
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Portable computers"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {editing && (
              <button
                onClick={() => {
                  setEditing(null);
                  setName("");
                  setDescription("");
                }}
                className="px-3 text-[12px] font-semibold text-slate-500"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12px] font-bold text-white"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editing ? "Save type" : "Add type"}
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {types.map((type) => (
            <div
              key={type.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-[#0A4FE8]">
                <Laptop className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#0D1B39]">
                  {type.name}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {type.description || "No description"}
                </p>
              </div>
              <Action
                icon={Pencil}
                label="Edit type"
                onClick={() => {
                  setEditing(type);
                  setName(type.name);
                  setDescription(type.description || "");
                }}
              />
              <Action
                icon={Trash2}
                label="Delete type"
                onClick={() => void remove(type)}
                danger
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function HistoryModal({
  equipment,
  assignments,
  onClose,
}: {
  equipment: Equipment;
  assignments: Assignment[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#071229]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B39]">
              Assignment history
            </h2>
            <p className="text-[12px] text-slate-500">
              {equipment.name} · {equipment.asset_tag}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {assignments.length ? (
          <div className="mt-5 space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="relative rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-[#0A4FE8]">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#0D1B39]">
                      {assignment.team_member_name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Assigned{" "}
                      {new Date(assignment.assigned_at).toLocaleString()}
                    </p>
                  </div>
                  {!assignment.returned_at && (
                    <span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
                      Current
                    </span>
                  )}
                </div>
                {assignment.returned_at && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Returned {new Date(assignment.returned_at).toLocaleString()}
                  </p>
                )}
                {assignment.assignment_note && (
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    {assignment.assignment_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 py-10 text-center text-sm text-slate-400">
            No assignment history yet.
          </p>
        )}
      </div>
    </div>
  );
}
