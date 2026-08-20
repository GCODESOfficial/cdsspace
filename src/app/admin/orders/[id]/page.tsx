"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface OrderProfile {
	full_name: string;
	email: string;
	company?: string;
	phone?: string;
}

interface StatusUpdate {
	id: string;
	previous_status: string;
	new_status: string;
	note: string;
	changed_by: string;
	created_at: string;
}

interface OrderDetail {
	id: string;
	displayId: string;
	type: "design" | "banner" | "merch";
	title: string;
	status: string;
	created_at: string;
	updated_at: string;
	description?: string;
	designBrief?: string;
	size?: string;
	quality?: string;
	environment?: string;
	format?: string;
	dimensions?: string;
	duration?: string;
	placement?: string;
	start_date?: string;
	end_date?: string;
	target_audience?: string;
	budget?: string;
	admin_notes?: string;
	profile: OrderProfile | null;
	status_updates: StatusUpdate[];
}

const STATUS_COLORS: Record<string, string> = {
  AWAITING_QUOTE: "bg-orange-500/20 text-orange-300",
  AWAITING_PAYMENT: "bg-sky-500/20 text-sky-300",
	PENDING: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
	IN_REVIEW: "bg-blue-500/20 text-blue-300 border-blue-500/30",
	ACTIVE: "bg-green-500/20 text-green-300 border-green-500/30",
	COMPLETED: "bg-gray-500/20 text-gray-300 border-gray-500/30",
	DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
	SCHEDULED: "bg-purple-500/20 text-purple-300 border-purple-500/30",
	ARCHIVED: "bg-gray-600/20 text-gray-400 border-gray-600/30",
};

const DESIGN_STATUSES = ["PENDING", "IN_REVIEW", "ACTIVE", "COMPLETED"];
const BANNER_STATUSES = ["AWAITING_QUOTE", "AWAITING_PAYMENT", "PENDING", "ACTIVE", "DRAFT", "SCHEDULED", "ARCHIVED", "COMPLETED"];

function formatDate(dateStr: string) {
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatShortDate(dateStr: string) {
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export default function AdminOrderDetailPage() {
	const params = useParams();
	const orderId = params.id as string;
	const { signOut } = useAuth();

	const [order, setOrder] = useState<OrderDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [newStatus, setNewStatus] = useState("");
	const [statusNote, setStatusNote] = useState("");
	const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
	const [adminNotes, setAdminNotes] = useState("");
	const [isSavingNotes, setIsSavingNotes] = useState(false);

	const fetchOrder = async () => {
		try {
			setIsLoading(true);
			const res = await fetch(`/api/admin/orders/${orderId}`);
			if (res.ok) {
				const data = await res.json();
				setOrder(data.order);
				setNewStatus(data.order.status);
				setAdminNotes(data.order.admin_notes || "");
			}
		} catch (error) {
			console.error("Error fetching order:", error);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (orderId) fetchOrder();
	}, [orderId]);

	const handleStatusUpdate = async () => {
		if (!newStatus || newStatus === order?.status) return;
		try {
			setIsUpdatingStatus(true);
			const res = await fetch(`/api/admin/orders/${orderId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					status: newStatus,
					note: statusNote,
				}),
			});
			if (res.ok) {
				setStatusNote("");
				await fetchOrder();
			}
		} catch (error) {
			console.error("Error updating status:", error);
		} finally {
			setIsUpdatingStatus(false);
		}
	};

	const handleSaveNotes = async () => {
		try {
			setIsSavingNotes(true);
			const res = await fetch(`/api/admin/orders/${orderId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ admin_notes: adminNotes }),
			});
			if (res.ok) {
				await fetchOrder();
			}
		} catch (error) {
			console.error("Error saving notes:", error);
		} finally {
			setIsSavingNotes(false);
		}
	};

	const availableStatuses = order?.type === "design" ? DESIGN_STATUSES : BANNER_STATUSES;

	if (isLoading) {
		return (
			<div className="min-h-screen text-white p-20 px-10 bg-[#151D48]">
				<div className="max-w-5xl mx-auto">
					<Skeleton className="h-8 w-40 bg-gray-600 mb-6" />
					<Skeleton className="h-10 w-64 bg-gray-600 mb-4" />
					<Skeleton className="h-6 w-48 bg-gray-600 mb-8" />
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<Skeleton className="h-48 bg-gray-600 rounded-lg" />
						<Skeleton className="h-48 bg-gray-600 rounded-lg" />
					</div>
					<Skeleton className="h-64 bg-gray-600 rounded-lg mt-6" />
				</div>
			</div>
		);
	}

	if (!order) {
		return (
			<div className="min-h-screen text-white p-20 px-10 bg-[#151D48]">
				<div className="max-w-5xl mx-auto text-center">
					<h1 className="text-2xl font-bold mb-4">Order not found</h1>
					<Link href="/admin/orders">
						<Button variant="ghost" className="text-[#5BA8FF]">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Orders
						</Button>
					</Link>
				</div>
			</div>
		);
	}

	// Collect all detail fields for display
	const detailFields: { label: string; value: string | undefined }[] = [
		{ label: "Description", value: order.description },
		{ label: "Design Brief", value: order.designBrief },
		{ label: "Size", value: order.size },
		{ label: "Quality", value: order.quality },
		{ label: "Environment", value: order.environment },
		{ label: "Format", value: order.format },
		{ label: "Dimensions", value: order.dimensions },
		{ label: "Duration", value: order.duration },
		{ label: "Placement", value: order.placement },
		{ label: "Start Date", value: order.start_date ? formatShortDate(order.start_date) : undefined },
		{ label: "End Date", value: order.end_date ? formatShortDate(order.end_date) : undefined },
		{ label: "Target Audience", value: order.target_audience },
		{ label: "Budget", value: order.budget },
	].filter((f) => f.value);

	return (
		<div className="min-h-screen text-white p-20 px-10 bg-[#151D48]">
			<div className="max-w-5xl mx-auto">
				{/* Back Button */}
				<Link href="/admin/orders">
					<Button
						variant="ghost"
						size="sm"
						className="text-gray-400 hover:text-white mb-6"
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to Orders
					</Button>
				</Link>

				{/* Order Header */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-2">
						<h1 className="text-3xl font-bold">{order.displayId}</h1>
						<Badge
							className={
								order.type === "design"
									? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
									: "bg-orange-500/20 text-orange-300 border-orange-500/30"
							}
						>
							{order.type === "design" ? "Design" : order.type === "merch" ? "Merch" : "Banner"}
						</Badge>
						<Badge className={STATUS_COLORS[order.status] || "bg-gray-500/20 text-gray-300"}>
							{order.status.replace("_", " ")}
						</Badge>
					</div>
					<h2 className="text-xl text-gray-300">{order.title}</h2>
					<p className="text-sm text-gray-400 mt-1">
						Created {formatDate(order.created_at)}
						{order.updated_at && ` | Updated ${formatDate(order.updated_at)}`}
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
					{/* Client Info Card */}
					<Card className="bg-[#0A4FE8] border-gray-700 p-6">
						<h3 className="text-lg font-semibold text-white mb-4">Client Information</h3>
						<div className="space-y-3">
							<div>
								<p className="text-xs text-gray-400 uppercase tracking-wide">Name</p>
								<p className="text-white">{order.profile?.full_name || "Unknown"}</p>
							</div>
							<div>
								<p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
								<p className="text-white">{order.profile?.email || "N/A"}</p>
							</div>
							{order.profile?.company && (
								<div>
									<p className="text-xs text-gray-400 uppercase tracking-wide">Company</p>
									<p className="text-white">{order.profile.company}</p>
								</div>
							)}
							{order.profile?.phone && (
								<div>
									<p className="text-xs text-gray-400 uppercase tracking-wide">Phone</p>
									<p className="text-white">{order.profile.phone}</p>
								</div>
							)}
						</div>
					</Card>

					{/* Order Details Card */}
					<Card className="bg-[#0A4FE8] border-gray-700 p-6">
						<h3 className="text-lg font-semibold text-white mb-4">Order Details</h3>
						{detailFields.length > 0 ? (
							<div className="space-y-3">
								{detailFields.map((field) => (
									<div key={field.label}>
										<p className="text-xs text-gray-400 uppercase tracking-wide">
											{field.label}
										</p>
										<p className="text-white whitespace-pre-wrap">{field.value}</p>
									</div>
								))}
							</div>
						) : (
							<p className="text-gray-400">No additional details provided.</p>
						)}
					</Card>
				</div>

				{/* Status Management */}
				<Card className="bg-[#0A4FE8] border-gray-700 p-6 mb-6">
					<h3 className="text-lg font-semibold text-white mb-4">Status Management</h3>
					<div className="flex items-center gap-2 mb-4">
						<span className="text-sm text-gray-400">Current Status:</span>
						<Badge className={STATUS_COLORS[order.status] || "bg-gray-500/20 text-gray-300"}>
							{order.status.replace("_", " ")}
						</Badge>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<label className="text-sm text-gray-400 mb-1 block">New Status</label>
							<Select value={newStatus} onValueChange={setNewStatus}>
								<SelectTrigger className="bg-[#151D48]/60 border-gray-600 text-white">
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent className="bg-[#151D48] border-gray-600 text-white">
									{availableStatuses.map((s) => (
										<SelectItem key={s} value={s} className="hover:bg-[#5BA8FF]/20">
											{s.replace("_", " ")}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="md:col-span-2">
							<label className="text-sm text-gray-400 mb-1 block">Note (optional)</label>
							<Textarea
								placeholder="Add a note for this status change..."
								value={statusNote}
								onChange={(e) => setStatusNote(e.target.value)}
								className="bg-[#151D48]/60 border-gray-600 text-white placeholder:text-gray-400 resize-none"
								rows={2}
							/>
						</div>
					</div>
					<Button
						onClick={handleStatusUpdate}
						disabled={isUpdatingStatus || newStatus === order.status}
						className="mt-4 bg-[#0A4FE8] text-white font-semibold hover:bg-[#083FC0]"
					>
						{isUpdatingStatus ? (
							<>
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
								Updating...
							</>
						) : (
							"Update Status"
						)}
					</Button>
				</Card>

				{/* Admin Notes */}
				<Card className="bg-[#0A4FE8] border-gray-700 p-6 mb-6">
					<h3 className="text-lg font-semibold text-white mb-4">Admin Notes</h3>
					<Textarea
						placeholder="Internal notes for the team..."
						value={adminNotes}
						onChange={(e) => setAdminNotes(e.target.value)}
						className="bg-[#151D48]/60 border-gray-600 text-white placeholder:text-gray-400 resize-none mb-4"
						rows={4}
					/>
					<Button
						onClick={handleSaveNotes}
						disabled={isSavingNotes}
						className="bg-[#0A4FE8] text-white font-semibold hover:bg-[#083FC0]"
					>
						{isSavingNotes ? (
							<>
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
								Saving...
							</>
						) : (
							<>
								<Save className="h-4 w-4 mr-2" />
								Save Notes
							</>
						)}
					</Button>
				</Card>

				{/* Status History Timeline */}
				<Card className="bg-[#0A4FE8] border-gray-700 p-6">
					<h3 className="text-lg font-semibold text-white mb-4">Status History</h3>
					{order.status_updates && order.status_updates.length > 0 ? (
						<div className="relative">
							{/* Timeline line */}
							<div className="absolute left-3 top-2 bottom-2 w-px bg-gray-600" />
							<div className="space-y-6">
								{order.status_updates
									.sort(
										(a, b) =>
											new Date(b.created_at).getTime() -
											new Date(a.created_at).getTime()
									)
									.map((update) => (
										<div key={update.id} className="relative pl-8">
											{/* Timeline dot */}
											<div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-[#5BA8FF] border-2 border-[#072056]" />
											<div>
												<div className="flex items-center gap-2 mb-1">
													<Badge
														className={
															STATUS_COLORS[update.previous_status] ||
															"bg-gray-500/20 text-gray-300"
														}
													>
														{update.previous_status.replace("_", " ")}
													</Badge>
													<span className="text-gray-400 text-sm">→</span>
													<Badge
														className={
															STATUS_COLORS[update.new_status] ||
															"bg-gray-500/20 text-gray-300"
														}
													>
														{update.new_status.replace("_", " ")}
													</Badge>
												</div>
												{update.note && (
													<p className="text-sm text-gray-300 mt-1">
														{update.note}
													</p>
												)}
												<p className="text-xs text-gray-500 mt-1">
													{update.changed_by && (
														<span>by {update.changed_by} &middot; </span>
													)}
													{formatDate(update.created_at)}
												</p>
											</div>
										</div>
									))}
							</div>
						</div>
					) : (
						<p className="text-gray-400">No status updates yet.</p>
					)}
				</Card>
			</div>
		</div>
	);
}
