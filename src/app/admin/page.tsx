"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CarrierLinkModal } from "@/components/carrier-link-modal";
import { AdvertisementModal } from "@/components/advertisement-modal";
import { FeaturedWorksModal } from "@/components/featured-brands-modal";
import { UploadedWorksTable } from "@/components/uploaded-works-table";
import { FeaturedWorksList } from "@/components/featured-brands-list";
import { getWorks } from "@/lib/storage-service";
import { Search, Star, Megaphone, Link2, TrendingUp, Globe, FolderOpen, BarChart3 } from "lucide-react";
import { logVisit } from "@/utils/logVisit";
import AdminNotificationBell from "@/components/notifications/admin-notification-bell";
import { useAdminSession } from "@/hooks/use-admin-session";
import { hasPermission } from "@/lib/admin-permissions";

export default function AdminDashboard() {
	const router = useRouter();
	const { session } = useAdminSession();
	const perms = session?.permissions || [];
	const isSuperAdmin = session?.role === "super_admin";
	const can = (key: string) => isSuperAdmin || hasPermission(perms, key);
	const [isCarrierModalOpen, setIsCarrierModalOpen] = useState(false);
	const [isAdModalOpen, setIsAdModalOpen] = useState(false);
	const [isBrandsModalOpen, setIsBrandsModalOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [workCount, setWorkCount] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [visits, setVisits] = useState(0);
	const [countryList, setCountryList] = useState<{ name: string; count: number }[]>([]);
	const [last7days, setLast7days] = useState<{ date: string; count: number }[]>([]);

	useEffect(() => {
		logVisit().catch((err) => console.error("Failed to log visit:", err));
	}, []);

	useEffect(() => {
		const fetchTraffic = async () => {
			const res = await fetch("/api/traffic-summary");
			const data = await res.json();
			setVisits(data.total);
			setCountryList(data.countries || []);
			setLast7days(data.last7days || []);
		};
		fetchTraffic();
		const interval = setInterval(fetchTraffic, 10000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		const fetchWorkCount = async () => {
			try {
				setIsLoading(true);
				const works = await getWorks();
				setWorkCount(works.length);
			} catch (error) {
				console.error("Error fetching work count:", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchWorkCount();
	}, []);

	const last7Total = last7days.reduce((acc, day) => acc + day.count, 0);

	return (
		<div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
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
					<AdminNotificationBell />
					<div className="w-9 h-9 rounded-full bg-[#0A4FE8] flex items-center justify-center text-white text-sm font-bold">
						A
					</div>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
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
				<div className="flex gap-3 flex-wrap">
					{can("dashboard.quick_actions") && <ActionPill icon={<Star className="w-4 h-4" />} label="Feature Brands" onClick={() => setIsBrandsModalOpen(true)} />}
					{can("dashboard.quick_actions") && <ActionPill icon={<Megaphone className="w-4 h-4" />} label="Manage Ads" onClick={() => setIsAdModalOpen(true)} />}
					{can("dashboard.quick_actions") && <ActionPill icon={<Link2 className="w-4 h-4" />} label="Career Link" onClick={() => setIsCarrierModalOpen(true)} />}
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

			{/* Modals */}
			<CarrierLinkModal isOpen={isCarrierModalOpen} onClose={() => setIsCarrierModalOpen(false)} />
			<AdvertisementModal isOpen={isAdModalOpen} onClose={() => setIsAdModalOpen(false)} />
			<FeaturedWorksModal isOpen={isBrandsModalOpen} onClose={() => setIsBrandsModalOpen(false)} />
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
			<div className={`${bgMap[color]} rounded-2xl p-5 transition hover:shadow-md`}>
				<div className="flex items-center justify-between mb-4">
					<div className={`${iconBgMap[color]} w-10 h-10 rounded-xl flex items-center justify-center`}>
						{icon}
					</div>
				</div>
				<p className="text-[28px] font-bold text-[#0D1B39] leading-none">{value}</p>
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
}: {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-blue-300 hover:text-[#0A4FE8] hover:bg-blue-50/50 transition-all cursor-pointer shadow-sm"
		>
			{icon}
			{label}
		</button>
	);
}
