'use client';

import { useState, useMemo } from "react";
import { NIGERIAN_BANKS } from "@/lib/finance/banks";
import { Search } from "lucide-react";

interface Props {
  value: string; // bank_code
  onChange: (code: string, name: string) => void;
  placeholder?: string;
}

export default function BankPicker({ value, onChange, placeholder = "Select bank" }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = NIGERIAN_BANKS.find((b) => b.code === value);
  const filtered = useMemo(
    () => NIGERIAN_BANKS.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80),
    [q]
  );
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-left text-sm flex items-center justify-between">
        <span className={selected ? "text-gray-900" : "text-gray-400"}>{selected ? selected.name : placeholder}</span>
        <span className="text-xs text-gray-400">{selected?.code}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-72 overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 ml-1" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search banks…" className="flex-1 outline-none text-sm" />
          </div>
          <div className="overflow-y-auto max-h-56">
            {filtered.map((b) => (
              <button key={b.code} type="button" onClick={() => { onChange(b.code, b.name); setOpen(false); setQ(""); }} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex items-center justify-between">
                <span>{b.name}</span>
                <span className="text-xs text-gray-400 font-mono">{b.code}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-4 text-center text-sm text-gray-400">No banks found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
