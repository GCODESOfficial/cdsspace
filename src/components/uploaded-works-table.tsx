/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	getWorks,
	deleteWork,
	searchWorks,
	sortWorks,
	type Work,
	type SortBy,
	type SortOrder,
} from "@/lib/storage-service";
import { toast } from "sonner";
import { Eye, Pencil, Trash2, Search, ArrowUpDown } from "lucide-react";
import Link from "next/link";

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
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [currentPage, setCurrentPage] = useState<number>(1);
	const [totalPages, setTotalPages] = useState<number>(1);
	const [localSearchQuery, setLocalSearchQuery] = useState<string>(searchQuery);
	const [sortBy, setSortBy] = useState<SortBy>("date");
	const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
	const itemsPerPage = 7;

	// Sync local search query with the prop when it changes
	useEffect(() => {
		setLocalSearchQuery(searchQuery);
	}, [searchQuery]);

	useEffect(() => {
		fetchWorks();
	}, []);

	useEffect(() => {
		if (works.length > 0) {
			handleSearch(localSearchQuery);
		}
	}, [works, localSearchQuery, sortBy, sortOrder]);

	const fetchWorks = async () => {
		try {
			setIsLoading(true);
			const data = await getWorks();
			setWorks(data);
			handleSearch(localSearchQuery);
		} catch (error) {
			toast.error("Failed to load works");
			console.error("Failed to load works:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSearch = async (query: string) => {
		try {
			const searchResults = await searchWorks(query);
			const sortedResults = sortWorks(searchResults, sortBy, sortOrder);
			setFilteredWorks(sortedResults);
			setTotalPages(Math.ceil(sortedResults.length / itemsPerPage));
			setCurrentPage(1);
		} catch (error) {
			console.error("Error searching works:", error);
		}
	};

	const handleLocalSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
		const query = e.target.value;
		setLocalSearchQuery(query);
		// Sync with parent component
		onSearchChange(query);
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteWork(id);
			await fetchWorks();
			toast.success("Work deleted successfully");
		} catch (error) {
			toast.error("Failed to delete work");
			console.error("Failed to delete work:", error);
		}
	};

	const handleSortChange = (value: string) => {
		setSortBy(value as SortBy);
	};

	const toggleSortOrder = () => {
		setSortOrder(sortOrder === "asc" ? "desc" : "asc");
	};

	const paginatedWorks = filteredWorks.slice(
		(currentPage - 1) * itemsPerPage,
		currentPage * itemsPerPage
	);

	return (
		<div className="border-none rounded-lg p-4">
			<div className="bg-white rounded-lg p-10 text-[#072056]">
				<div className="flex flex-col md:flex-row gap-8 mb-4 w-full">
					<h2 className="font-bold text-xl">Uploaded Works</h2>
					<div className="relative flex-1">
						<Input
							placeholder="Search works..."
							value={localSearchQuery}
							onChange={handleLocalSearchChange}
							className="pl-8 bg-[#E7E7E7]"
						/>
						<Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
					</div>
					<div className="flex gap-2 text-lg font-semibold">
						<Select value={sortBy} onValueChange={handleSortChange}>
							<SelectTrigger className="w-[180px] bg-[#E7E7E7]">
								<h1 className="font-normal text-sm text-gray-500">
									sorted by:
								</h1>
								<SelectValue placeholder="Sort by" />
							</SelectTrigger>
							<SelectContent className="bg-[#E7E7E7] text-[#072056]">
								<SelectItem value="date">Date</SelectItem>
								<SelectItem value="name">Name</SelectItem>
								<SelectItem value="category">Category</SelectItem>
							</SelectContent>
						</Select>
						<Button
							variant="outline"
							size="icon"
							onClick={toggleSortOrder}
							className="bg-[#E7E7E7] border-gray-700"
						>
							<ArrowUpDown className="h-4 w-4" />
						</Button>
					</div>

					<Link href="/admin/upload-works">
						<Button
							size="sm"
							className="bg-[#072056] hover:bg-[#08129C] text-white text-2xl"
						>
							+
						</Button>
					</Link>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="bg-[#08129C] text-white flex justify-between rounded-tl-xl rounded-tr-xl">
								<th className="text-left py-4 px-14">Date</th>
								<th className="text-left py-4 px-14">Name</th>
								<th className="text-left py-4 px-14">Category</th>
								<th className="text-left py-4 px-14">Manage</th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								<tr>
									<td colSpan={7} className="py-4 text-center text-gray-400">
										Loading...
									</td>
								</tr>
							) : paginatedWorks.length === 0 ? (
								<tr>
									<td colSpan={7} className="py-4 text-center text-gray-400">
										{localSearchQuery
											? `No works found matching "${localSearchQuery}"`
											: "No works found"}
									</td>
								</tr>
							) : (
								paginatedWorks.map((work) => (
									<tr
										key={work.id}
										className="border-b border-gray-700 text-sm flex items-center justify-between"
									>
										<td className="py-2 px-10">
											{new Date(work.createdAt).toLocaleDateString()}
										</td>
										<td className="py-2 px-10 truncate overflow-hidden whitespace-nowrap max-w-[150px]">
											{work.title}
										</td>
										<td className="py-2 px-10 truncate overflow-hidden whitespace-nowrap max-w-[150px]">
											{work.category}
										</td>

										<td className="py-2 px-10 flex space-x-1">
											<Link href={`/work/${work.id}`} target="_blank">
												<Button
													size="sm"
													variant="ghost"
													className="h-8 w-8 p-0"
												>
													<Eye className="h-4 w-4" />
												</Button>
											</Link>
											<Link href={`/admin/upload-works/edit/${work.id}`}>
												<Button
													size="sm"
													variant="ghost"
													className="h-8 w-8 p-0"
												>
													<Pencil className="h-4 w-4" />
												</Button>
											</Link>
											<Button
												size="sm"
												variant="ghost"
												className="h-8 w-8 p-0"
												onClick={() => {
													if (
														window.confirm(
															"Are you sure you want to delete this work?"
														)
													) {
														handleDelete(work.id);
													}
												}}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			<div className="flex justify-between items-center mt-4 text-xs">
				<div className="text-gray-400">
					Showing {paginatedWorks.length} out of {filteredWorks.length} entries
				</div>
				<div className="flex space-x-1">
					<Button
						size="sm"
						variant="ghost"
						className="w-6 h-6 p-0 bg-white text-[#072056] font-bold text-xl"
						disabled={currentPage === 1}
						onClick={() => setCurrentPage(currentPage - 1)}
					>
						{"<"}
					</Button>

					{Array.from({ length: totalPages }).map((_, index) => (
						<Button
							key={index}
							size="sm"
							variant={currentPage === index + 1 ? "default" : "ghost"}
							className={`w-6 h-6 p-0 ${
								currentPage === index + 1
									? "bg-gradient-to-r rounded from-[#08129C] to-[#072056] border border-white"
									: "bg-gradient-to-r rounded from-[#08129C] to-[#072056]"
							}`}
							onClick={() => setCurrentPage(index + 1)}
						>
							{index + 1}
						</Button>
					))}

					<Button
						size="sm"
						variant="ghost"
						className="w-6 h-6 p-0 bg-white text-[#072056] font-bold text-xl"
						disabled={currentPage === totalPages}
						onClick={() => setCurrentPage(currentPage + 1)}
					>
						&gt;
					</Button>
				</div>
			</div>
		</div>
	);
}
