import { LucideIcon } from "lucide-react";
import { glassCard } from "./FinanceShell";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string; // tailwind gradient e.g. "from-blue-500 to-indigo-500"
  sub?: string;
}

export default function StatCard({ icon: Icon, label, value, accent, sub }: Props) {
  return (
    <div className={`${glassCard} p-6 relative overflow-hidden`}>
      <div className={`absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br ${accent} opacity-10 blur-3xl rounded-full`} />
      <div className="relative">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} grid place-items-center shadow-lg shadow-blue-600/15 mb-4`}>
          <Icon className="w-6 h-6 text-white" strokeWidth={2.2} />
        </div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}
