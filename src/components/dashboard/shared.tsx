import { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";

/* ---------- Design tokens ---------- */
export const dashCard =
  "rounded-2xl bg-white/80 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)]";

export const dashSubcard =
  "rounded-xl bg-gray-50/80 border border-gray-100";

/* ---------- Page header ---------- */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        {back && (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mb-2 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {back.label}
          </Link>
        )}
        <h1 className="text-[28px] xl:text-[32px] leading-tight font-bold text-gray-900 tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Stat card ---------- */
export function DashStat({
  icon: Icon,
  label,
  value,
  accent = "from-blue-500 to-indigo-500",
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className={`${dashCard} p-5 relative overflow-hidden`}>
      <div className={`absolute -top-8 -right-8 w-28 h-28 bg-gradient-to-br ${accent} opacity-10 blur-3xl rounded-full`} />
      <div className="relative">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} grid place-items-center shadow-lg shadow-blue-600/10 mb-4`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------- Section card wrapper ---------- */
export function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${dashCard} p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="font-semibold text-gray-900 text-base">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
