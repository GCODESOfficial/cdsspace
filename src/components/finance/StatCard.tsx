import { LucideIcon } from "lucide-react";
import { glassCard } from "./FinanceShell";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}

export default function StatCard({ icon: Icon, label, value, sub }: Props) {
  return (
    <div className={`${glassCard} p-6 relative overflow-hidden`}>
      <div className="relative">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/15">
          <Icon className="w-6 h-6 text-white" strokeWidth={2.2} />
        </div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}
