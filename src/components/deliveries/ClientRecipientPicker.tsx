"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Search,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";

export interface ClientRecipientOption {
  value: string;
  name: string;
  email: string | null;
  hasPlatformAccount: boolean;
}

interface ClientRecipientPickerProps {
  options: ClientRecipientOption[];
  values: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}

/**
 * Branded, searchable delivery-recipient picker.
 * The order of `values` is significant: the first entry is the primary recipient.
 */
export function ClientRecipientPicker({
  options,
  values,
  onChange,
  multiple = true,
  disabled = false,
}: ClientRecipientPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const uniqueValues = useMemo(() => Array.from(new Set(values.filter(Boolean))), [values]);
  const selected = useMemo(() => new Set(uniqueValues), [uniqueValues]);
  const selectedOptions = useMemo(
    () => uniqueValues.map((value) => options.find((option) => option.value === value)).filter((option): option is ClientRecipientOption => Boolean(option)),
    [options, uniqueValues],
  );
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => {
      const status = option.hasPlatformAccount ? "cds space account signed up" : "manual client invite required";
      return `${option.name} ${option.email || ""} ${status}`.toLocaleLowerCase().includes(term);
    });
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function toggle(value: string) {
    if (selected.has(value)) {
      onChange(uniqueValues.filter((current) => current !== value));
      return;
    }

    if (multiple) onChange([...uniqueValues, value]);
    else {
      onChange([value]);
      setOpen(false);
    }
  }

  const triggerText = selectedOptions.length === 0
    ? "Choose a manual customer or signed-up client"
    : selectedOptions.length === 1
      ? selectedOptions[0].name
      : `${selectedOptions.length} clients selected`;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={multiple ? "Choose receiving clients" : "Choose receiving client"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl border bg-white px-3.5 text-left shadow-sm outline-none transition focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-[#0A4FE8] ring-4 ring-blue-50" : "border-gray-200 hover:border-blue-300"
        }`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0A4FE8]">
          <Users className="h-4 w-4" />
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm ${selectedOptions.length ? "font-semibold text-[#07133B]" : "font-normal text-gray-400"}`}>
          {triggerText}
        </span>
        {selectedOptions.length > 0 && (
          <span className="rounded-full bg-[#0A4FE8] px-2 py-0.5 text-[10px] font-bold text-white">
            {selectedOptions.length}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {selectedOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedOptions.map((option, index) => (
            <span key={option.value} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-1.5 text-[11px] font-semibold text-[#17366F]">
              {index === 0 && multiple && <span className="text-[9px] font-bold uppercase tracking-wider text-[#0A4FE8]">Primary</span>}
              <span className="max-w-52 truncate">{option.name}</span>
              <button
                type="button"
                aria-label={`Remove ${option.name}`}
                onClick={() => toggle(option.value)}
                className="rounded p-0.5 text-blue-300 transition hover:bg-white hover:text-rose-500"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_24px_70px_rgba(7,19,59,0.18)]">
          <div className="border-b border-gray-100 bg-blue-50/80 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients by name or email..."
                className="h-11 w-full rounded-xl border border-blue-100 bg-white pl-10 pr-10 text-sm font-normal text-[#07133B] outline-none placeholder:text-gray-400 focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
              />
              {query && (
                <button type="button" aria-label="Clear client search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold text-gray-400">
              <span>{filteredOptions.length} client{filteredOptions.length === 1 ? "" : "s"} found</span>
              {multiple && <span>Select all clients receiving this delivery</span>}
            </div>
          </div>

          <div role="listbox" aria-multiselectable={multiple} className="max-h-80 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Search className="mx-auto mb-2 h-7 w-7 text-gray-200" />
                <p className="text-sm font-semibold text-[#07133B]">No clients found</p>
                <p className="mt-1 text-xs font-normal text-gray-400">Try a different name or email address.</p>
              </div>
            ) : filteredOptions.map((option) => {
              const isSelected = selected.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.value)}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    isSelected ? "border-blue-200 bg-blue-50" : "border-transparent hover:border-blue-100 hover:bg-blue-50/50"
                  }`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${isSelected ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-300 bg-white text-transparent group-hover:border-blue-400"}`}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${option.hasPlatformAccount ? "bg-blue-100 text-[#0A4FE8]" : "bg-gray-100 text-gray-500"}`}>
                    {option.hasPlatformAccount ? <UserRoundCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[#07133B]">{option.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-gray-400">{option.email || "No email address saved"}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${option.hasPlatformAccount ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {option.hasPlatformAccount ? "CDS Space account" : "Invite required"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-4 py-2.5 text-[10px] font-medium text-gray-400">
            <span>{multiple ? "First selection is the primary recipient" : "One client per Brand Identity delivery"}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 font-bold text-[#0A4FE8] hover:bg-blue-50">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
