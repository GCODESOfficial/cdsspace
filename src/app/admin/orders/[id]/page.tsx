"use client";

import { useState, useEffect, useMemo } from "react";
import { RichText } from "@/components/shared/RichText";
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
import { ArrowLeft, Save, RefreshCw, ClipboardList, FolderKanban, Loader2, ShieldCheck } from "lucide-react";
import { appAlert } from "@/lib/app-notify";

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
	workflow_type?: "taskboard" | "project" | null;
	workflow_status?: string;
	team_title?: string | null;
	team_brief?: string | null;
	task_id?: string | null;
	workflow_board_id?: string | null;
	project_id?: string | null;
	delivery_id?: string | null;
}

interface WorkflowBoard { id: string; title: string; lists: Array<{ id: string; title: string }>; }
interface WorkflowMember { id: string; full_name: string; department: string | null; role_title: string | null; }

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

	const [order, setOrder] = useState<OrderDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [newStatus, setNewStatus] = useState("");
	const [statusNote, setStatusNote] = useState("");
	const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
	const [adminNotes, setAdminNotes] = useState("");
	const [isSavingNotes, setIsSavingNotes] = useState(false);
	const [workflowBoards, setWorkflowBoards] = useState<WorkflowBoard[]>([]);
	const [workflowMembers, setWorkflowMembers] = useState<WorkflowMember[]>([]);
	const [workflowRoute, setWorkflowRoute] = useState<"taskboard" | "project">("taskboard");
	const [workflowBoardId, setWorkflowBoardId] = useState("");
	const [workflowListId, setWorkflowListId] = useState("");
	const [workflowMemberIds, setWorkflowMemberIds] = useState<string[]>([]);

	/**
	 * Team members grouped by department, so a whole department can be assigned
	 * in one click. Anyone without a department is gathered at the end rather
	 * than dropped, since they are still assignable.
	 */
	const workflowDepartments = useMemo(() => {
		const groups = new Map<string, WorkflowMember[]>();
		for (const member of workflowMembers) {
			const name = member.department?.trim() || "No department";
			const existing = groups.get(name);
			if (existing) existing.push(member);
			else groups.set(name, [member]);
		}
		return Array.from(groups, ([name, members]) => ({
			name,
			members: [...members].sort((a, b) => a.full_name.localeCompare(b.full_name)),
		})).sort((a, b) => {
			if (a.name === "No department") return 1;
			if (b.name === "No department") return -1;
			return a.name.localeCompare(b.name);
		});
	}, [workflowMembers]);
	const [teamTitle, setTeamTitle] = useState("");
	const [teamBrief, setTeamBrief] = useState("");
	const [isRouting, setIsRouting] = useState(false);

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

	useEffect(() => {
		if (!order || order.type !== "design" || order.workflow_type) return;
		const plainBrief = document.createElement("div");
		plainBrief.innerHTML = order.description || "";
		setTeamTitle(order.team_title || `Design production ${order.displayId}`);
		setTeamBrief(order.team_brief || plainBrief.textContent || "");
		fetch(`/api/admin/orders/${orderId}/workflow`, { cache: "no-store" })
			.then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Could not load workflow options")))
			.then((data) => {
				const boards = data.boards || [];
				setWorkflowBoards(boards);
				setWorkflowMembers(data.members || []);
				if (boards[0]) {
					setWorkflowBoardId(boards[0].id);
					setWorkflowListId(boards[0].lists?.[0]?.id || "");
				}
			})
			.catch((error) => console.error(error));
	}, [order, orderId]);

	const routeOrder = async () => {
		if (!workflowMemberIds.length) return void appAlert("Select at least one team member.");
		if (workflowRoute === "taskboard" && (!workflowBoardId || !workflowListId)) return void appAlert("Choose a taskboard list.");
		setIsRouting(true);
		try {
			const response = await fetch(`/api/admin/orders/${orderId}/workflow`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					route: workflowRoute,
					board_id: workflowBoardId,
					list_id: workflowListId,
					member_ids: workflowMemberIds,
					team_title: teamTitle,
					team_brief: teamBrief,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || "Could not route this order.");
			await fetchOrder();
		} catch (error) {
			await appAlert(error instanceof Error ? error.message : "Could not route this order.");
		} finally {
			setIsRouting(false);
		}
	};

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
										{/* Briefs arrive as the editor's HTML, so they are rendered
											rather than printed: tags on screen were the old behaviour. */}
										<RichText value={field.value} tone="dark" className="mt-0.5" />
									</div>
								))}
							</div>
						) : (
							<p className="text-gray-400">No additional details provided.</p>
						)}
					</Card>
				</div>

				{order.type === "design" && (
					<Card className="mb-6 border-blue-200 bg-white p-6 text-[#0D1B39]">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<h3 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="h-5 w-5 text-[#0A4FE8]" /> Production handoff</h3>
								<p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Route the order to a task list or create a project. The team sees only the production title and brief below, never the client name, contact details, or account.</p>
							</div>
							<span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0A4FE8]"><ShieldCheck className="h-3.5 w-3.5" /> Client identity protected</span>
						</div>

						{order.workflow_type ? (
							<div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
								<p className="font-semibold text-emerald-800">Routed to {order.workflow_type === "project" ? "a project" : "the taskboard"}</p>
								<p className="mt-1 text-sm text-emerald-700">Internal state: {(order.workflow_status || "assigned").replaceAll("_", " ")}</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{order.workflow_type === "taskboard" && order.task_id && <Link href={`/admin/taskboard?${new URLSearchParams({ ...(order.workflow_board_id ? { board_id: order.workflow_board_id } : {}), task_id: order.task_id }).toString()}`} className="rounded-lg bg-[#0A4FE8] px-3 py-2 text-xs font-semibold text-white">Open taskboard</Link>}
									{order.project_id && <Link href="/admin/finance/projects" className="rounded-lg bg-[#0A4FE8] px-3 py-2 text-xs font-semibold text-white">Open projects</Link>}
									{order.delivery_id && <Link href="/admin/clients/deliveries" className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-[#0A4FE8]">Open delivery review</Link>}
								</div>
							</div>
						) : (
							<div className="mt-5 space-y-4">
								<div className="grid gap-3 md:grid-cols-2">
									<button type="button" onClick={() => setWorkflowRoute("taskboard")} className={`flex items-center gap-3 rounded-xl border p-4 text-left ${workflowRoute === "taskboard" ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200"}`}><ClipboardList className="h-5 w-5 text-[#0A4FE8]" /><span><strong className="block text-sm">Send to taskboard</strong><small className="text-slate-500">Create assigned production work</small></span></button>
									<button type="button" onClick={() => setWorkflowRoute("project")} className={`flex items-center gap-3 rounded-xl border p-4 text-left ${workflowRoute === "project" ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200"}`}><FolderKanban className="h-5 w-5 text-[#0A4FE8]" /><span><strong className="block text-sm">Create a project</strong><small className="text-slate-500">Open a managed project workspace</small></span></button>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<label className="text-sm font-medium">Team-facing title<input value={teamTitle} onChange={(event) => setTeamTitle(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
									{/* A native multiple-select needed ctrl-clicking to pick more
										than one person and gave no way to take a whole department.
										Checkboxes make multiple selection obvious, and each
										department header assigns or clears everyone under it. */}
									<div className="text-sm font-medium">
										<div className="flex flex-wrap items-baseline justify-between gap-2">
											<span>Assigned team members</span>
											<span className="text-xs font-normal text-slate-500">
												{workflowMemberIds.length ? `${workflowMemberIds.length} selected` : "Nobody selected yet"}
												{workflowMemberIds.length > 0 && (
													<button type="button" onClick={() => setWorkflowMemberIds([])} className="ms-2 font-semibold text-[#0A4FE8] hover:underline">Clear</button>
												)}
											</span>
										</div>
										<div className="mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
											{workflowDepartments.length === 0 && <p className="p-3 text-xs font-normal text-slate-500">No active team members to assign.</p>}
											{workflowDepartments.map((group) => {
												const ids = group.members.map((member) => member.id);
												const selected = ids.filter((id) => workflowMemberIds.includes(id));
												const all = selected.length === ids.length;
												return (
													<div key={group.name} className="mb-1 last:mb-0">
														<div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
															<span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
																{group.name} <span className="font-medium normal-case tracking-normal text-slate-400">({selected.length}/{ids.length})</span>
															</span>
															<button
																type="button"
																onClick={() => setWorkflowMemberIds((current) => (all
																	? current.filter((id) => !ids.includes(id))
																	: Array.from(new Set([...current, ...ids]))))}
																className="text-[11px] font-semibold text-[#0A4FE8] hover:underline"
															>
																{all ? "Remove department" : "Assign department"}
															</button>
														</div>
														{group.members.map((member) => {
															const checked = workflowMemberIds.includes(member.id);
															return (
																<label key={member.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-blue-50/60 ${checked ? "bg-blue-50" : ""}`}>
																	<input
																		type="checkbox"
																		checked={checked}
																		onChange={() => setWorkflowMemberIds((current) => (checked
																			? current.filter((id) => id !== member.id)
																			: [...current, member.id]))}
																		className="h-4 w-4 shrink-0 accent-[#0A4FE8]"
																	/>
																	<span className="min-w-0">
																		<span className="block truncate text-[13px] font-medium text-slate-800">{member.full_name}</span>
																		{member.role_title && <span className="block truncate text-[11px] font-normal text-slate-400">{member.role_title}</span>}
																	</span>
																</label>
															);
														})}
													</div>
												);
											})}
										</div>
										{/* The first person picked leads the delivery, which is worth
											saying out loud since the order decides it. */}
										{workflowMemberIds.length > 0 && (
											<p className="mt-1.5 text-xs font-normal text-slate-500">
												{workflowMembers.find((member) => member.id === workflowMemberIds[0])?.full_name} leads this delivery.
											</p>
										)}
									</div>
								</div>
								<label className="block text-sm font-medium">Team-facing brief<textarea value={teamBrief} onChange={(event) => setTeamBrief(event.target.value)} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-[#0A4FE8]" /></label>
								{workflowRoute === "taskboard" && <div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Board<select value={workflowBoardId} onChange={(event) => { const board = workflowBoards.find((item) => item.id === event.target.value); setWorkflowBoardId(event.target.value); setWorkflowListId(board?.lists?.[0]?.id || ""); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">{workflowBoards.map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}</select></label><label className="text-sm font-medium">List<select value={workflowListId} onChange={(event) => setWorkflowListId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">{(workflowBoards.find((board) => board.id === workflowBoardId)?.lists || []).map((list) => <option key={list.id} value={list.id}>{list.title}</option>)}</select></label></div>}
								<button type="button" onClick={() => void routeOrder()} disabled={isRouting || !teamTitle.trim() || !teamBrief.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-50">{isRouting ? <Loader2 className="h-4 w-4 animate-spin" /> : workflowRoute === "project" ? <FolderKanban className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />} {workflowRoute === "project" ? "Create project and assign" : "Create task and assign"}</button>
							</div>
						)}
					</Card>
				)}

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
