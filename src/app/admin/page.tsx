"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { UploadedWorksTable } from "@/components/uploaded-works-table";
import { FeaturedWorksList } from "@/components/featured-brands-list";
import { supabase } from "@/lib/supabase";

// Modals only render on interaction - lazy-load them so they stay out of the
// initial dashboard bundle.
const CarrierLinkModal = dynamic(() => import("@/components/carrier-link-modal").then((m) => m.CarrierLinkModal), { ssr: false });
const AdvertisementModal = dynamic(() => import("@/components/advertisement-modal").then((m) => m.AdvertisementModal), { ssr: false });
const FeaturedWorksModal = dynamic(() => import("@/components/featured-brands-modal").then((m) => m.FeaturedWorksModal), { ssr: false });
import { Search, Star, Megaphone, Link2, TrendingUp, Globe, FolderOpen, BarChart3, ShieldCheck, Mail, BriefcaseBusiness, Building2, KeyRound, CheckCircle2, ArrowRight, ArrowRightLeft, MessageSquare, MessagesSquare, CalendarClock, Plane, ShoppingBag, FileText } from "lucide-react";
import { logVisit } from "@/utils/logVisit";
import { BirthdayReminder } from "@/components/admin/BirthdayCelebrate";
import { useAdminSession, type AdminSession } from "@/hooks/use-admin-session";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, hasPermission } from "@/lib/admin-permissions";

export default function AdminDashboard() {
	const router = useRouter();
	const { session, isLoading: isSessionLoading } = useAdminSession();
	const perms = session?.permissions || [];
	const isSuperAdmin = session?.role === "super_admin";
	const can = (key: string) => isSuperAdmin || hasPermission(perms, key);
	const hasDashboardAccess = isSuperAdmin || can("dashboard");
	const [isCarrierModalOpen, setIsCarrierModalOpen] = useState(false);
	const [isAdModalOpen, setIsAdModalOpen] = useState(false);
	const [isBrandsModalOpen, setIsBrandsModalOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [workCount, setWorkCount] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [visits, setVisits] = useState(0);
	const [countryList, setCountryList] = useState<{ name: string; count: number }[]>([]);
	const [last7days, setLast7days] = useState<{ date: string; count: number }[]>([]);
	const [actionCounts, setActionCounts] = useState<Record<string, number>>({});

	useEffect(() => {
		if (!hasDashboardAccess) return;
		const fetchCounts = async () => {
			try {
				const res = await fetch("/api/admin/dashboard-actions");
				if (!res.ok) return;
				const data = await res.json();
				if (data.ok) setActionCounts(data.counts || {});
			} catch { /* ignore */ }
		};
		fetchCounts();
		const interval = setInterval(() => { if (!document.hidden) fetchCounts(); }, 30000);
		return () => clearInterval(interval);
	}, [hasDashboardAccess]);

	useEffect(() => {
		if (!hasDashboardAccess) return;
		logVisit().catch((err) => console.error("Failed to log visit:", err));
	}, [hasDashboardAccess]);

	useEffect(() => {
		if (!hasDashboardAccess) return;
		const fetchTraffic = async () => {
			const res = await fetch("/api/traffic-summary");
			const data = await res.json();
			setVisits(data.total);
			setCountryList(data.countries || []);
			setLast7days(data.last7days || []);
		};
		fetchTraffic();
		const interval = setInterval(() => { if (!document.hidden) fetchTraffic(); }, 30000);
		return () => clearInterval(interval);
	}, [hasDashboardAccess]);

	useEffect(() => {
		if (!hasDashboardAccess) return;
		const fetchWorkCount = async () => {
			try {
				setIsLoading(true);
				// Count only - don't fetch every work row just to read .length.
				const { count } = await supabase.from("works").select("id", { count: "exact", head: true });
				setWorkCount(count ?? 0);
			} catch (error) {
				console.error("Error fetching work count:", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchWorkCount();
	}, [hasDashboardAccess]);

	const last7Total = last7days.reduce((acc, day) => acc + day.count, 0);

	if (isSessionLoading) {
		return (
			<div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
				<div className="h-32 rounded-2xl bg-white/70 border border-white/70 animate-pulse" />
			</div>
		);
	}

	if (session?.role === "sub_admin" && !hasDashboardAccess) {
		return <SubAdminAccessOverview session={session} />;
	}

	return (
		<div className="max-w-[1680px] p-4 sm:p-6 lg:p-8">
			<BirthdayReminder />
			{/* Top Bar */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
				<div className="min-w-0">
					<p className="text-[#0A4FE8] text-sm font-semibold">Welcome back, {session?.name || "Admin"}!</p>
					<h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Dashboard</h1>
				</div>
				<div className="flex w-full sm:w-auto items-center gap-3">
					<div className="relative flex-1 sm:flex-none">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
						<input
							type="text"
							placeholder="Search..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9 pr-4 py-2 w-full sm:w-56 rounded-xl bg-white border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
						/>
					</div>
					<div className="w-9 h-9 rounded-full bg-[#0A4FE8] flex items-center justify-center text-white text-sm font-bold">
						A
					</div>
				</div>
			</div>

			{/* Stats */}
			<div className="mb-8 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
				<StatCard
					icon={<FolderOpen className="w-5 h-5 text-[#0A4FE8]" />}
					label="Total Works"
					value={isLoading ? "..." : workCount.toString()}
					color="blue"
				/>
				<StatCard
					icon={<BarChart3 className="w-5 h-5 text-[#7C3AED]" />}
					label="Categories"
					value="7"
					color="purple"
				/>
				<StatCard
					icon={<TrendingUp className="w-5 h-5 text-[#059669]" />}
					label="Website Traffic"
					value={visits.toString()}
					subtitle={`${last7Total} last 7 days`}
					color="green"
				/>
				<StatCard
					icon={<Globe className="w-5 h-5 text-[#EA580C]" />}
					label="Countries"
					value={`${countryList.length}+`}
					color="orange"
					tooltip={
						countryList.length > 0 ? (
							<div className="space-y-1">
								{countryList.slice(0, 8).map((c) => (
									<div key={c.name} className="flex justify-between gap-6 text-xs">
										<span>{c.name}</span>
										<span className="text-gray-400">{((c.count / visits) * 100).toFixed(1)}%</span>
									</div>
								))}
							</div>
						) : null
					}
				/>
			</div>

			{/* Quick Actions */}
			<div className="mb-8">
				<h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h2>
				<div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
					{can("dashboard.quick_actions") && <ActionPill icon={<Star className="w-4 h-4" />} label="Feature Brands" onClick={() => setIsBrandsModalOpen(true)} />}
					{can("dashboard.quick_actions") && <ActionPill icon={<Megaphone className="w-4 h-4" />} label="Manage Ads" onClick={() => setIsAdModalOpen(true)} />}
					{can("dashboard.quick_actions") && <ActionPill icon={<Link2 className="w-4 h-4" />} label="Career Link" onClick={() => setIsCarrierModalOpen(true)} />}

					{can("messages") && <ActionPill icon={<MessageSquare className="w-4 h-4" />} label="Chat/Meet" badge={actionCounts.client_messages} onClick={() => router.push("/admin/messages")} />}
					{can("team_chat") && <ActionPill icon={<MessagesSquare className="w-4 h-4" />} label="Team Chat" badge={actionCounts.team_chat} onClick={() => router.push("/admin/chat")} />}
					{can("applicants") && <ActionPill icon={<BriefcaseBusiness className="w-4 h-4" />} label="Applications" badge={actionCounts.applications} onClick={() => router.push("/admin/applications")} />}
					{can("consultations") && <ActionPill icon={<CalendarClock className="w-4 h-4" />} label="Consultations" badge={actionCounts.consultations} onClick={() => router.push("/admin/consultations")} />}
					{(can("timebook") || can("team_members")) && <ActionPill icon={<Plane className="w-4 h-4" />} label="Leave Requests" badge={actionCounts.leave} onClick={() => router.push("/admin/hrm")} />}
					{can("orders") && <ActionPill icon={<ShoppingBag className="w-4 h-4" />} label="Orders" badge={actionCounts.orders} onClick={() => router.push("/admin/orders")} />}
					{can("brand_briefs") && <ActionPill icon={<FileText className="w-4 h-4" />} label="Brand Briefs" badge={actionCounts.briefs} onClick={() => router.push("/admin/brand-briefs")} />}
				</div>
			</div>

			{/* Content Grid */}
			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				{/* Works Table */}
				<div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
					<UploadedWorksTable
						searchQuery={searchQuery}
						onSearchChange={(q) => setSearchQuery(q)}
					/>
				</div>

				{/* Featured Brands */}
				<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
					<FeaturedWorksList />
				</div>
			</div>

			{/* Modals - mounted only when open so their code loads on demand. */}
			{isCarrierModalOpen && <CarrierLinkModal isOpen={isCarrierModalOpen} onClose={() => setIsCarrierModalOpen(false)} />}
			{isAdModalOpen && <AdvertisementModal isOpen={isAdModalOpen} onClose={() => setIsAdModalOpen(false)} />}
			{isBrandsModalOpen && <FeaturedWorksModal isOpen={isBrandsModalOpen} onClose={() => setIsBrandsModalOpen(false)} />}
		</div>
	);
}

function SubAdminAccessOverview({ session }: { session: AdminSession }) {
	const router = useRouter();
	const permissions = session.permissions || [];
	const wildcard = permissions.includes("all");
	const knownPermissionKeys = new Set([
		"all",
		...PERMISSION_GROUPS.map((group) => group.key),
		...ALL_PERMISSIONS.map((permission) => permission.key),
	]);
	const grantedGroups = PERMISSION_GROUPS.map((group) => {
		const hasFullGroup = wildcard || permissions.includes(group.key);
		const granted = group.permissions.filter((permission) => hasFullGroup || permissions.includes(permission.key));
		return { group, hasFullGroup, granted };
	}).filter((entry) => entry.hasFullGroup || entry.granted.length > 0);
	const unknownPermissions = permissions.filter((permission) => !knownPermissionKeys.has(permission));
	const grantedCount = wildcard
		? ALL_PERMISSIONS.length
		: grantedGroups.reduce((count, entry) => count + entry.granted.length, 0) + unknownPermissions.length;
	const firstRoute = grantedGroups.find((entry) => entry.group.route)?.group.route;
	const adminRole = session.adminRoleName || "Manual sub-admin access";
	const teamRole = session.teamRoleTitle || "Team member";
	const department = session.department || "Not assigned";

	return (
		<div className="max-w-[1680px] p-4 sm:p-6 lg:p-8">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-8">
				<div>
					<div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0A4FE8] ring-1 ring-blue-100">
						<ShieldCheck className="h-3.5 w-3.5" />
						Sub-admin access
					</div>
					<h1 className="mt-3 text-[28px] font-bold text-[#0D1B39] tracking-tight">Your Admin Role & Permissions</h1>
					<p className="mt-1 max-w-2xl text-sm text-gray-500">
						You are signed in through your team account. These are the admin sections and actions currently assigned to you.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{firstRoute && (
						<button
							onClick={() => router.push(firstRoute)}
							className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083EC0]"
						>
							Open allowed section <ArrowRight className="h-4 w-4" />
						</button>
					)}
					<button
						onClick={() => router.push("/team")}
						className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0D1B39] shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
					>
						<ArrowRightLeft className="h-4 w-4" />
						Team portal
					</button>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
				<AccessInfoCard icon={<ShieldCheck className="h-5 w-5" />} label="Admin Role" value={adminRole} />
				<AccessInfoCard icon={<BriefcaseBusiness className="h-5 w-5" />} label="Team Role" value={teamRole} />
				<AccessInfoCard icon={<Building2 className="h-5 w-5" />} label="Department" value={department} />
				<AccessInfoCard icon={<KeyRound className="h-5 w-5" />} label="Granted Permissions" value={`${grantedCount}`} />
			</div>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
				<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-fit">
					<h2 className="text-lg font-bold text-[#0D1B39]">Team Member Details</h2>
					<div className="mt-5 space-y-4">
						<ProfileRow icon={<ShieldCheck className="h-4 w-4" />} label="Name" value={session.name} />
						<ProfileRow icon={<Mail className="h-4 w-4" />} label="Email" value={session.email} />
						<ProfileRow icon={<BriefcaseBusiness className="h-4 w-4" />} label="Team role" value={teamRole} />
						<ProfileRow icon={<Building2 className="h-4 w-4" />} label="Department" value={department} />
						<ProfileRow icon={<KeyRound className="h-4 w-4" />} label="Session source" value={session.source === "team_cookie" ? "Team portal" : "Admin login"} />
					</div>
				</section>

				<section>
					<div className="flex items-center justify-between gap-3 mb-4">
						<div>
							<h2 className="text-lg font-bold text-[#0D1B39]">Assigned Permissions</h2>
							<p className="text-xs text-gray-400 mt-0.5">{grantedGroups.length} admin section{grantedGroups.length === 1 ? "" : "s"} available</p>
						</div>
					</div>

					{grantedGroups.length === 0 && unknownPermissions.length === 0 ? (
						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
							<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
								<KeyRound className="h-5 w-5" />
							</div>
							<h3 className="font-semibold text-[#0D1B39]">No permissions assigned</h3>
							<p className="mt-1 text-sm text-gray-500">Ask a super admin to update your access from Team Members.</p>
						</div>
					) : (
						<div className="space-y-4">
							{grantedGroups.map((entry) => (
								<PermissionGroupCard
									key={entry.group.key}
									label={entry.group.label}
									route={entry.group.route}
									hasFullGroup={entry.hasFullGroup}
									permissions={entry.granted}
								/>
							))}
							{unknownPermissions.length > 0 && (
								<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
									<h3 className="text-sm font-semibold text-[#0D1B39]">Additional Permission Keys</h3>
									<div className="mt-3 flex flex-wrap gap-2">
										{unknownPermissions.map((permission) => (
											<span key={permission} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
												{permission}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

function AccessInfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
			<div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0A4FE8]">{icon}</div>
			<p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
			<p className="mt-1 text-lg font-bold text-[#0D1B39] leading-tight">{value}</p>
		</div>
	);
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<div className="flex items-start gap-3">
			<div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-400">{icon}</div>
			<div className="min-w-0">
				<p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
				<p className="mt-0.5 break-words text-sm font-medium text-[#0D1B39]">{value}</p>
			</div>
		</div>
	);
}

function PermissionGroupCard({
	label,
	route,
	hasFullGroup,
	permissions,
}: {
	label: string;
	route?: string;
	hasFullGroup: boolean;
	permissions: { key: string; label: string; description: string }[];
}) {
	return (
		<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h3 className="text-base font-bold text-[#0D1B39]">{label}</h3>
					{route && <p className="mt-0.5 text-xs text-gray-400">{route}</p>}
				</div>
				{hasFullGroup && (
					<span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
						<CheckCircle2 className="h-3.5 w-3.5" />
						Full section
					</span>
				)}
			</div>
			<div className="mt-4 divide-y divide-gray-100">
				{permissions.map((permission) => (
					<div key={permission.key} className="py-3 first:pt-0 last:pb-0">
						<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-sm font-semibold text-[#0D1B39]">{permission.label}</p>
							<code className="w-fit rounded-md bg-white px-2 py-1 text-[11px] text-gray-500 ring-1 ring-gray-100">{permission.key}</code>
						</div>
						<p className="mt-1 text-xs leading-5 text-gray-500">{permission.description}</p>
					</div>
				))}
			</div>
		</div>
	);
}

/* ── Stat Card ── */
function StatCard({
	icon,
	label,
	value,
	subtitle,
	color,
	tooltip,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	subtitle?: string;
	color: "blue" | "purple" | "green" | "orange";
	tooltip?: React.ReactNode;
}) {
	const bgMap = {
		blue: "bg-blue-50",
		purple: "bg-purple-50",
		green: "bg-emerald-50",
		orange: "bg-orange-50",
	};
	const iconBgMap = {
		blue: "bg-blue-100",
		purple: "bg-purple-100",
		green: "bg-emerald-100",
		orange: "bg-orange-100",
	};

	return (
		<div className="relative group">
			<div className={`${bgMap[color]} min-h-[150px] rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:min-h-[176px] sm:p-5`}>
				<div className="flex items-center justify-between mb-4">
					<div className={`${iconBgMap[color]} w-10 h-10 rounded-xl flex items-center justify-center`}>
						{icon}
					</div>
				</div>
				<p className="text-[24px] font-bold text-[#0D1B39] leading-none sm:text-[28px]">{value}</p>
				<p className="text-[13px] text-gray-500 mt-1.5 font-medium">{label}</p>
				{subtitle && (
					<p className="text-[11px] text-gray-400 mt-1">{subtitle}</p>
				)}
			</div>
			{tooltip && (
				<div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-4 min-w-[200px] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 scale-95 group-hover:scale-100">
					{tooltip}
				</div>
			)}
		</div>
	);
}

/* ── Action Pill ── */
function ActionPill({
	icon,
	label,
	onClick,
	badge,
}: {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
	badge?: number;
}) {
	const showBadge = typeof badge === "number" && badge > 0;
	return (
		<button
			onClick={onClick}
			className="relative flex min-h-11 min-w-0 items-center justify-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[12px] font-semibold text-gray-600 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:text-[#0A4FE8] sm:px-4 sm:text-sm"
		>
			{icon}
			{label}
			{showBadge && (
				<span className="ml-0.5 inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white leading-none">
					{badge > 99 ? "99+" : badge}
				</span>
			)}
		</button>
	);
}
