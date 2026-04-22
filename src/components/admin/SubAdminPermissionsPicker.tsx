"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Shield } from "lucide-react";
import {
  PERMISSION_GROUPS,
  type PermissionGroup,
} from "@/lib/admin-permissions";

/**
 * A grouped checkbox list so a super-admin can hand-pick exactly which
 * admin sections a new sub-admin can access.
 *
 * Selecting the group key grants the whole section. Selecting a finer
 * `key.subkey` grants just that action; the group's parent is inferred
 * as granted by hasPermission() at runtime.
 */

// Groups we never want listed here (always excluded):
const HIDDEN_GROUP_KEYS = new Set(["upload_works_edit"]);

export function SubAdminPermissionsPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  const selected = useMemo(() => new Set(value), [value]);

  const groups = PERMISSION_GROUPS.filter((g) => !HIDDEN_GROUP_KEYS.has(g.key));

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  function toggleGroup(g: PermissionGroup) {
    const allSubKeys = g.permissions.map((p) => p.key);
    const hasAll = allSubKeys.every((k) => selected.has(k)) || selected.has(g.key);

    const next = new Set(selected);
    if (hasAll) {
      next.delete(g.key);
      allSubKeys.forEach((k) => next.delete(k));
    } else {
      next.add(g.key);
      allSubKeys.forEach((k) => next.add(k));
    }
    onChange(Array.from(next));
  }

  const totalSelected = groups.reduce((n, g) => {
    const groupFullyOn = selected.has(g.key);
    const subCount = g.permissions.filter((p) => selected.has(p.key)).length;
    return n + (groupFullyOn ? g.permissions.length || 1 : subCount);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#0A4FE8]" />
          <span className="text-[13px] font-semibold text-[#0D1B39]">
            Sub-admin access
          </span>
        </div>
        <span className="text-[11px] text-gray-400">
          {totalSelected} permission{totalSelected === 1 ? "" : "s"} selected
        </span>
      </div>

      <div className={`space-y-2 ${compact ? "" : "max-h-[420px] overflow-y-auto pr-1"}`}>
        {groups.map((g) => (
          <GroupCard
            key={g.key}
            group={g}
            selected={selected}
            onToggleGroup={() => toggleGroup(g)}
            onToggleItem={toggle}
          />
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        Menus the sub-admin doesn&apos;t have access to are hidden from their sidebar.
      </p>
    </div>
  );
}

function GroupCard({
  group,
  selected,
  onToggleGroup,
  onToggleItem,
}: {
  group: PermissionGroup;
  selected: Set<string>;
  onToggleGroup: () => void;
  onToggleItem: (key: string) => void;
}) {
  const allKeys = group.permissions.map((p) => p.key);
  const everyOn = selected.has(group.key) || allKeys.every((k) => selected.has(k));
  const someOn = !everyOn && allKeys.some((k) => selected.has(k));
  const [open, setOpen] = useState(someOn);

  return (
    <div className={`rounded-xl border ${everyOn || someOn ? "border-[#0A4FE8]/30 bg-[#0A4FE8]/[0.02]" : "border-gray-100 bg-gray-50/50"}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleGroup}
          className={`w-4 h-4 rounded border flex items-center justify-center transition shrink-0 ${
            everyOn
              ? "bg-[#0A4FE8] border-[#0A4FE8] text-white"
              : someOn
                ? "bg-[#0A4FE8]/15 border-[#0A4FE8]"
                : "bg-white border-gray-300"
          }`}
          aria-checked={everyOn ? "true" : someOn ? "mixed" : "false"}
          role="checkbox"
        >
          {everyOn && <Check className="w-3 h-3" strokeWidth={3} />}
          {someOn && <span className="w-2 h-0.5 bg-[#0A4FE8] rounded" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 flex items-center justify-between text-left"
        >
          <span className="text-[13px] font-semibold text-[#0D1B39]">{group.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && group.permissions.length > 0 && (
        <div className="px-3 pb-3 space-y-1 ml-7">
          {group.permissions.map((p) => {
            const on = selected.has(p.key) || selected.has(group.key);
            return (
              <label
                key={p.key}
                className="flex items-start gap-2.5 py-1.5 cursor-pointer hover:bg-white/60 rounded px-2"
              >
                <button
                  type="button"
                  onClick={() => onToggleItem(p.key)}
                  className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center transition shrink-0 ${
                    on
                      ? "bg-[#0A4FE8] border-[#0A4FE8] text-white"
                      : "bg-white border-gray-300"
                  }`}
                  aria-checked={on}
                  role="checkbox"
                >
                  {on && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-[#0D1B39] leading-tight">
                    {p.label}
                  </p>
                  <p className="text-[11px] text-gray-500 leading-snug">{p.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
