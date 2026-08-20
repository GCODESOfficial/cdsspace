import DashboardLayout from "@/app/(dashboard)/layout";

export const dynamic = "force-dynamic";

export default function ScopedClientDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
