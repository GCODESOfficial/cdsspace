/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getSlugFromTitle } from "@/lib/utils";

interface WorkImage {
	id: number;
	work_id: number;
	image_url: string;
	position: number;
	transformations?: {
		size?: { width: number; height: number };
		isFullWidth?: boolean;
		spanRows?: number;
	};
}

interface Work {
	id: number;
	title: string;
	description: string;
	cover_image?: string;
	cover_url?: string;
	image?: string;
	category?: string;
	created_at: string;
}

interface GridItem {
	image: WorkImage;
	index: number;
	isFullWidth: boolean;
	spanRows: number;
	height: number;
}

interface GridRow {
	items: GridItem[];
	height: number;
}

export default function ViewWorkPage() {
	const router = useRouter();
	const params = useParams();
	const [work, setWork] = useState<Work | null>(null);
	const [images, setImages] = useState<WorkImage[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const slug = params.title as string;
		if (slug) {
			fetchWorkBySlug(slug);
		}
	}, [params.title]);

	async function fetchWorkBySlug(slug: string) {
		try {
			setLoading(true);
			setError(null);

			const { data: works, error: workError } = await supabase
				.from("works")
				.select("*");
			if (workError) throw workError;

			const matched = (works || []).find(
				(w) => getSlugFromTitle(w.title) === slug
			);

			if (!matched) {
				setError("Project not found.");
				toast.error("Project not found.");
				router.push("/admin");
				return;
			}

			setWork(matched);

			const { data: imagesData, error: imagesError } = await supabase
				.from("work_images")
				.select("*")
				.eq("work_id", matched.id)
				.order("position");

			if (imagesError) throw imagesError;

			setImages(imagesData || []);
		} catch (error: any) {
			console.error("Error loading project:", error);
			setError(error.message || "Failed to load project details.");
			toast.error("Failed to load project details.");
			router.push("/admin");
		} finally {
			setLoading(false);
		}
	}

	const createGridLayout = (): GridRow[] => {
		if (!images || images.length === 0) return [];

		const sortedImages = [...images].sort((a, b) => a.position - b.position);
		const grid: GridRow[] = [];

		let currentRow: GridItem[] = [];
		let currentRowHeight = 0;

		sortedImages.forEach((image, index) => {
			const isFullWidth = image.transformations?.isFullWidth || false;
			const spanRows = image.transformations?.spanRows || 1;
			const standardHeight = 12;
			const imageHeight = spanRows * standardHeight;

			if (isFullWidth) {
				if (currentRow.length > 0) {
					grid.push({ items: [...currentRow], height: currentRowHeight });
					currentRow = [];
					currentRowHeight = 0;
				}
				grid.push({
					items: [{ image, index, isFullWidth, spanRows, height: imageHeight }],
					height: imageHeight,
				});
			} else {
				currentRow.push({
					image,
					index,
					isFullWidth,
					spanRows,
					height: imageHeight,
				});
				currentRowHeight = Math.max(currentRowHeight, imageHeight);

				if (currentRow.length === 2) {
					grid.push({ items: [...currentRow], height: currentRowHeight });
					currentRow = [];
					currentRowHeight = 0;
				}
			}
		});

		if (currentRow.length > 0) {
			grid.push({ items: [...currentRow], height: currentRowHeight });
		}

		return grid;
	};

	const gridRows = createGridLayout();

	if (loading) {
		return (
			<div className="min-h-screen bg-white text-black p-6 flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
					<p>Loading project details...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-white text-black p-6 py-40 flex items-center justify-center">
				<div className="text-center">
					<p className="text-red-500 mb-4">Error: {error}</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => router.push("/admin")}
					>
						Back to Dashboard
					</Button>
				</div>
			</div>
		);
	}

	if (!work) {
		return (
			<div className="min-h-screen bg-white text-black p-6 py-40 flex items-center justify-center">
				<div className="text-center">
					<p>Project not found.</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => router.push("/admin")}
					>
						Back to Dashboard
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-white py-40 text-black p-6">
			<div className="max-w-6xl mx-auto">

				<div className="space-y-6 mb-8 md:flex justify-between max-w-6xl border-b pb-14">
        <h1 className="text-3xl font-bold">{work.title}</h1>
					<div className="md:text-right md:mt-14 mt-8 max-w-md">
						<p className="text-black whitespace-pre-line">
							{work.description || "No description provided."}
						</p>
					</div>
				</div>

				
    <div className="pt-20">
				{images.length > 0 ? (
					<div className="space-y-4">
						{gridRows.map((row, rowIndex) => (
							<div
								key={rowIndex}
								className="grid grid-cols-2 gap-4"
								style={{ height: `${row.height}rem` }}
							>
								{row.items.map(({ image, index, isFullWidth }) => (
									<div
										key={index}
										className={`relative rounded-md overflow-hidden ${
											isFullWidth ? "col-span-2" : ""
										}`}
										style={{
											height: "100%",
											gridColumn: isFullWidth ? "span 2" : "span 1",
										}}
									>
										<img
											src={image.image_url || "/placeholder.svg"}
											alt={`Project image ${index + 1}`}
											className="w-full h-full object-cover"
											style={{
												transform: `scale(${
													(image.transformations?.size?.width || 100) / 100
												})`,
											}}
										/>
									</div>
								))}
							</div>
						))}
					</div>
				) : (
					<div className="border rounded-md p-8 text-center text-muted-foreground">
						<p>No images available for this project.</p>
					</div>
				)}
        </div>
			</div>
		</div>
	);
}
