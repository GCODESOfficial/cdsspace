"use client";

import { Trash2, Archive, X } from "lucide-react";

interface BulkAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "danger" | "default";
}

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: BulkAction[];
}

export default function BulkActionBar({ selectedCount, onClear, actions }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-30 bg-[#0D1B39] text-white rounded-xl px-5 py-3 flex items-center justify-between mb-4 shadow-lg animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <button onClick={onClear} className="p-1 rounded-md hover:bg-white/10 transition">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition ${
              action.variant === "danger"
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
