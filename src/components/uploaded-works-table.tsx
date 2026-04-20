/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import {
	getWorks,
	deleteWork,
	sortWorks,
	type Work,
	type SortBy,
	type SortOrder,
} from "@/lib/storage-service";
import { toast } from "sonner";
import { Eye, Pencil, Trash2, Search, ArrowUpDown, ChevronLeft, ChevronRight, Archive } from "lucide-react";
import Link from "next/link";
import BulkActionBar from "@/components/admin/BulkActionBar";

interface UploadedWorksTableProps {
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
}

export function UploadedWorksTable({
	searchQuery = "",
	onSearchChange = () => {},
}: UploadedWorksTableProps) {
	const [works, setWorks] = useState<Work[]>([]);
	const [filteredWorks, setFilteredWorks] = useState<Work[]>([]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(true);
	const [currentPage, setCurrentPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
	const [sortBy, setSortBy] = useState<SortBy>("date");
	const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
	const itemsPerPage = 7;

	useEffect(() => { setLocalSearchQuery(searchQuery); }, [searchQuery]);
	useEffect(() => { fetchWorks(); }, []);
	useEffect(() => { if (works.length > 0) handleSearch(localSearchQuery); }, [works, localSearchQuery, sortBy, sortOrder]);

	const fetchWorks = async () => {
		try {
			setIsLoading(true);
			const data = await getWorks();
			setWorks(data);
		} catch (error) {
			toast.error("Failed to load works");
		} finally {
			setIsLoading(false);
		}
	};

	const handleSearch = (query: string) => {
		let results = works;
		if (query.trim()) {
			const q = query.toLowerCase();
			results = works.filter((w) =>
				w.title.toLowerCase().includes(q) || w.category.toLowerCase().includes(q)
			);
		}
		const sorted = sortWorks(results, sortBy, sortOrder);
		setFilteredWorks(sorted);
		setTotalPages(Math.ceil(sorted.length / itemsPerPage));
		setCurrentPage(1);
	};

	const handleLocalSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
		const q = e.target.value;
		setLocalSearchQuery(q);
		onSearchChange(q);
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteWork(id);
			await fetchWorks();
			toast.success("Work deleted");
		} catch (error) {
			toast.error("Failed to delete");
		}
	};

	const handleBulkDelete = async () => {
		if (!window.confirm(`Delete ${selected.size} works?`)) return;
		for (const id of selected) { await deleteWork(id).catch(() => {}); }
		setSelected(new Set());
		await fetchWorks();
		toast.success(`${selected.size} works deleted`);
	};

	const toggleSelect = (id: string) => {
		const copy = new Set(selected);
		copy.has(id) ? copy.delete(id) : copy.add(id);
		setSelected(copy);
	};

	const toggleAll = () => {
		if (selected.size === paginatedWorks.length) setSelected(new Set());
		else setSelected(new Set(paginatedWorks.map(w => w.id)));
	};

	const paginatedWorks = filteredWorks.slice(
		(currentPage - 1) * itemsPerPage,
		currentPage * itemsPerPage
	);

	return (
		<div className="p-6">
			{/* Header */}
			<div className="flex items-center justify-between mb-5">
				<h2 className="text-[16px] font-semibold text-[#0D1B39]">Uploaded Works</h2>
				<div className="flex items-center gap-2.5">
					{/* Search */}
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
						<input
							placeholder="Search..."
							value={localSearchQuery}
							onChange={handleLocalSearchChange}
							className="pl-8 pr-3 py-2 w-44 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
						/>
					</div>

					{/* Sort */}
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value as SortBy)}
						className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
					>
						<option value="date">Date</option>
						<option value="name">Name</option>
						<option value="category">Category</option>
					</select>

					<button
						onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
						className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
					>
						<ArrowUpDown className="w-3.5 h-3.5" />
					</button>

					{/* Add */}
					<Link href="/admin/upload-works">
						<button className="w-8 h-8 rounded-lg bg-[#0A4FE8] text-white flex items-center justify-center hover:bg-[#083EC0] transition text-lg font-light">
							+
						</button>
					</Link>
				</div>
			</div>

			{/* Bulk Actions */}
			<BulkActionBar
				selectedCount={selected.size}
				onClear={() => setSelected(new Set())}
				actions={[
					{ label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleBulkDelete, variant: "danger" },
				]}
			/>

			{/* Table */}
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b border-gray-100">
							<th className="py-2.5 px-3 w-10">
								<input type="checkbox" checked={paginatedWorks.length > 0 && selected.size === paginatedWorks.length} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
							</th>
							<th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
							<th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name</th>
							<th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
							<th className="text-right py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr><td colSpan={4} className="py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
						) : paginatedWorks.length === 0 ? (
							<tr><td colSpan={4} className="py-10 text-center text-gray-400 text-sm">
								{localSearchQuery ? `No results for "${localSearchQuery}"` : "No works found"}
							</td></tr>
						) : (
							paginatedWorks.map((work) => (
								<tr key={work.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${selected.has(work.id) ? "bg-blue-50/50" : ""}`}>
									<td className="py-3 px-3">
										<input type="checkbox" checked={selected.has(work.id)} onChange={() => toggleSelect(work.id)} className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
									</td>
									<td className="py-3 px-3 text-[13px] text-gray-500">
										{new Date(work.createdAt).toLocaleDateString()}
									</td>
									<td className="py-3 px-3 text-[13px] font-medium text-[#0D1B39] max-w-[180px] truncate">
										{work.title}
									</td>
									<td className="py-3 px-3">
										<span className="inline-block px-2.5 py-1 rounded-md bg-blue-50 text-[#0A4FE8] text-[11px] font-medium">
											{work.category}
										</span>
									</td>
									<td className="py-3 px-3">
										<div className="flex items-center justify-end gap-1">
											<Link href={`/admin/works/${work.id}`} target="_blank">
												<button className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
													<Eye className="w-3.5 h-3.5" />
												</button>
											</Link>
											<Link href={`/admin/upload-works/edit/${work.id}`}>
												<button className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition">
													<Pencil className="w-3.5 h-3.5" />
												</button>
											</Link>
											<button
												className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
												onClick={() => {
													if (window.confirm("Delete this work?")) handleDelete(work.id);
												}}
											>
												<Trash2 className="w-3.5 h-3.5" />
											</button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50">
					<p className="text-[11px] text-gray-400">
						{paginatedWorks.length} of {filteredWorks.length} entries
					</p>
					<div className="flex items-center gap-1">
						<button
							disabled={currentPage === 1}
							onClick={() => setCurrentPage(currentPage - 1)}
							className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
						{Array.from({ length: totalPages }).map((_, i) => (
							<button
								key={i}
								onClick={() => setCurrentPage(i + 1)}
								className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
									currentPage === i + 1
										? "bg-[#0A4FE8] text-white shadow-sm"
										: "text-gray-500 hover:bg-gray-100"
								}`}
							>
								{i + 1}
							</button>
						))}
						<button
							disabled={currentPage === totalPages}
							onClick={() => setCurrentPage(currentPage + 1)}
							className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
