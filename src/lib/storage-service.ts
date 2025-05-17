/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";
import { v4 as uuidv4 } from "uuid";

export type Work = {
	id: string;
	title: string;
	description: string;
	category: string;
	imageUrl: string;
	coverUrl: string | null;
	createdAt: string;
	updatedAt: string;
};

type WorkImage = {
	isFullWidth: boolean;
	spanRows: number;
	size: { width: number; height: number };
	id?: number;
	work_id?: number;
	image_url?: string;
	position?: number;
	transformations?: Record<string, any>;
};

export type Brand = {
	id: string;
	name: string;
	order: number;
	selected: boolean;
	createdAt: string;
};

export type Advertisement = {
	id: string;
	imageUrl: string;
	link: string;
	createdAt: string;
};

export type CarrierLink = {
	id: string;
	url: string;
	createdAt: string;
};

export type SortOrder = "asc" | "desc";
export type SortBy = "date" | "name" | "category";

// Helper function to convert database row to frontend model
const mapWorkFromDb = (row: any): Work => ({
	id: row.id,
	title: row.title,
	description: row.description,
	category: row.category,
	coverUrl: row.cover_image,
	createdAt: row.created_at,
	updatedAt: row.updated_at || row.created_at,
	imageUrl: "",
});

const mapBrandFromDb = (row: any): Brand => ({
	id: row.id,
	name: row.name,
	order: row.order,
	selected: row.selected,
	createdAt: row.created_at,
});

const mapAdvertisementFromDb = (row: any): Advertisement => ({
	id: row.id,
	imageUrl: row.image_path,
	link: row.link,
	createdAt: row.created_at,
});

const mapCarrierLinkFromDb = (row: any): CarrierLink => ({
	id: row.id,
	url: row.url,
	createdAt: row.created_at,
});

// File upload functions
export async function uploadFile(file: File, folder: string): Promise<string> {
	const fileExt = file.name.split(".").pop() || "";
	const filePath = `${folder}/${uuidv4()}.${fileExt}`;

	const { error } = await supabase.storage
		.from("media")
		.upload(filePath, file);

	if (error) {
		console.error("Error uploading file:", error);
		throw new Error(`Failed to upload file: ${error.message}`);
	}

	const publicUrl = supabase.storage
		.from("media")
		.getPublicUrl(filePath);

	return publicUrl.data.publicUrl;
}

export async function deleteFile(url: string): Promise<void> {
	try {
		// Extract the path from the URL
		const urlObj = new URL(url);
		const pathParts = urlObj.pathname.split("/");
		const bucketName = pathParts[1];
		const filePath = pathParts.slice(2).join("/");

		if (bucketName && filePath) {
			const { error } = await supabase.storage
				.from(bucketName)
				.remove([filePath]);
			if (error) {
				throw error;
			}
		}
	} catch (error) {
		console.error("Error deleting file:", error);
		throw new Error("Failed to delete file");
	}
}

// Works functions
export async function getWorks(): Promise<Work[]> {
	try {
		const { data, error } = await supabase
			.from("works")
			.select("*")
			.order("created_at", { ascending: false });

		if (error) {
			throw error;
		}

		return data.map(mapWorkFromDb);
	} catch (error) {
		console.error("Error fetching works:", error);
		return [];
	}
}

export async function getWorkById(id: string): Promise<
  | (Work & {
      work_images: WorkImage[];
    })
  | null
> {
  const { data: work, error: workError } = await supabase
    .from("works")
    .select("*")
    .eq("id", id) // Treat id as a string here
    .single();

  if (workError) {
    console.error("Error fetching work:", workError);
    return null;
  }

	if (work) {
		const { data: workImages, error: imagesError } = await supabase
			.from("work_images")
			.select("*")
			.eq("work_id", id)
			.order("position", { ascending: true });

		if (imagesError) {
			console.error("Error fetching work images:", imagesError);
			return { ...work, work_images: [] }; // Return work with empty images array in case of error
		}

		return { ...work, work_images: workImages as WorkImage[] };
	}

	return null;
}

export async function addWork(workData: {
	name: string;
	description: string;
	category: string;
	coverUrl: string;
	imageUrl: string;
}): Promise<{ id: number } | null> {
	const { data, error } = await supabase
		.from("works")
		.insert([
			{
				name: workData.name,
				description: workData.description,
				category: workData.category,
				cover_image: workData.coverUrl,
				image_url: workData.imageUrl,
			},
		])
		.select("id")
		.single();

	if (error) {
		console.error("Error creating work:", error);
		return null;
	}

	return data;
}

export const getWorkDetails = async (id: string) => {
	const { data, error } = await supabase
		.from("works") // Replace "works" with the actual table name
		.select("*")
		.eq("id", id)
		.single(); // Use .single() to get only one result

	if (error) {
		throw error;
	}

	return data;
};

export async function updateWork(workData: {
	id: string;
	name: string;
	description: string;
	category: string;
	coverUrl: string;
}): Promise<Work | null> {
	const { data, error } = await supabase
		.from("works")
		.update({
			name: workData.name,
			description: workData.description,
			category: workData.category,
			cover_image: workData.coverUrl,
			updated_at: new Date().toISOString(),
		})
		.eq("id", workData.id)
		.select("*")
		.single();

	if (error) {
		console.error("Error updating work:", error);
		return null;
	}

	return data as Work | null;
}


export async function deleteWork(id: string): Promise<void> {
	try {
		// Fetch the work to delete its images and other associated data
		const work = await getWorkById(id);

		if (work) {
			// Delete the images from storage if they exist
			if (work.imageUrl) {
				await deleteFile(work.imageUrl);
			}
			if (work.coverUrl) {
				await deleteFile(work.coverUrl);
			}

			// Delete associated work images from the work_images table
			const { error: deleteImagesError } = await supabase
				.from("work_images")
				.delete()
				.eq("work_id", id);

			if (deleteImagesError) {
				console.error("Error deleting associated work images:", deleteImagesError);
			}
		}

		// Delete the work from the database
		const { error: deleteWorkError } = await supabase
			.from("works")
			.delete()
			.eq("id", id);

		if (deleteWorkError) throw deleteWorkError;

	} catch (error) {
		console.error(`Error deleting work with id ${id}:`, error);
		throw new Error("Failed to delete work");
	}
}


export async function searchWorks(query: string): Promise<Work[]> {
	try {
		if (!query.trim()) {
			return getWorks();
		}

		const { data, error } = await supabase
			.from("works")
			.select("*")
			.or(
				`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`
			)
			.order("created_at", { ascending: false });

		if (error) {
			throw error;
		}

		return data.map(mapWorkFromDb);
	} catch (error) {
		console.error("Error searching works:", error);
		return [];
	}
}

export function sortWorks(
	works: Work[],
	sortBy: SortBy,
	sortOrder: SortOrder
): Work[] {
	const sortedWorks = [...works];

	switch (sortBy) {
		case "date":
			sortedWorks.sort((a, b) => {
				const dateA = new Date(a.createdAt).getTime();
				const dateB = new Date(b.createdAt).getTime();
				return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
			});
			break;
		case "name":
			sortedWorks.sort((a, b) => {
				return sortOrder === "asc"
					? a.title.localeCompare(b.title)
					: b.title.localeCompare(a.title);
			});
			break;
		case "category":
			sortedWorks.sort((a, b) => {
				return sortOrder === "asc"
					? a.category.localeCompare(b.category)
					: b.category.localeCompare(a.category);
			});
			break;
		default:
			// Default sort by date descending
			sortedWorks.sort((a, b) => {
				const dateA = new Date(a.createdAt).getTime();
				const dateB = new Date(b.createdAt).getTime();
				return dateB - dateA;
			});
	}

	return sortedWorks;
}

// Brands functions
export async function getBrands(): Promise<Brand[]> {
	try {
		const { data, error } = await supabase
			.from("brands")
			.select("*")
			.order("order", { ascending: true });

		if (error) {
			throw error;
		}

		return data.map(mapBrandFromDb);
	} catch (error) {
		console.error("Error fetching brands:", error);
		return [];
	}
}

export const getSelectedWorks = (): Work[] => {
	const storedWorks = localStorage.getItem("selectedWorks");
	if (storedWorks) {
	  return JSON.parse(storedWorks); // or return the array of works, depending on how you store them
	}
	return [];
  };
  
export async function addBrand(name: string): Promise<Brand> {
	try {
		// Get the current count of brands for ordering
		const { count } = await supabase
			.from("brands")
			.select("*", { count: "exact", head: true });

		const newBrand = {
			name,
			order: count || 0,
			selected: false,
			created_at: new Date().toISOString(),
		};

		const { data, error } = await supabase
			.from("brands")
			.insert([newBrand])
			.select()
			.single();

		if (error) {
			throw error;
		}

		return mapBrandFromDb(data);
	} catch (error) {
		console.error("Error adding brand:", error);
		throw new Error("Failed to add brand");
	}
}

export async function deleteBrand(id: string): Promise<void> {
	try {
		const { error } = await supabase.from("brands").delete().eq("id", id);

		if (error) {
			throw error;
		}
	} catch (error) {
		console.error(`Error deleting brand with id ${id}:`, error);
		throw new Error("Failed to delete brand");
	}
}

export async function updateBrandSelection(
	id: string,
	selected: boolean
): Promise<void> {
	try {
		const { error } = await supabase
			.from("brands")
			.update({ selected })
			.eq("id", id);

		if (error) {
			throw error;
		}
	} catch (error) {
		console.error(`Error updating brand selection with id ${id}:`, error);
		throw new Error("Failed to update brand selection");
	}
}

export async function updateBrandOrder(brandIds: string[]): Promise<void> {
	try {
		// Create a batch of updates
		const updates = brandIds.map((id, index) => ({
			id,
			order: index,
		}));

		// Use a transaction to update all brands at once
		const { error } = await supabase.rpc("update_brand_orders", {
			updates: updates,
		});

		if (error) {
			throw error;
		}
	} catch (error) {
		console.error("Error updating brand order:", error);
		throw new Error("Failed to update brand order");
	}
}

// Advertisements functions

// Advertisement logic (enhanced with ad limit and better UX)

const MAX_ADS = 3; // Set your ad limit

export async function getAdvertisements(): Promise<Advertisement[]> {
	try {
		const { data, error } = await supabase
			.from("advertisements")
			.select("*")
			.order("created_at", { ascending: false });

		if (error) throw error;

		return data.map(mapAdvertisementFromDb);
	} catch (error) {
		console.error("Error fetching advertisements:", error);
		return [];
	}
}

export async function addAdvertisement(adData: {
	imageUrl: string;
	link: string;
}): Promise<{ success: boolean; message: string }> {
	try {
		const existingAds = await getAdvertisements();

		if (existingAds.length >= MAX_ADS) {
			return {
				success: false,
				message: `Ad limit of ${MAX_ADS} reached. Please delete an ad before adding a new one.`,
			};
		}

		const { error } = await supabase.from("advertisements").insert([
			{
				image_path: adData.imageUrl,
				link: adData.link,
			},
		]);

		if (error) throw error;

		return { success: true, message: "Ad added successfully." };
	} catch (error) {
		console.error("Error adding advertisement:", error);
		return {
			success: false,
			message: "Failed to add advertisement.",
		};
	}
}

export async function deleteAdvertisement(
	id: string,
	imageUrl?: string
): Promise<{ success: boolean; message: string }> {
	try {
		// 1. Delete image from Supabase storage
		if (imageUrl) {
			await deleteFile(imageUrl);
		}

		// 2. Delete the ad from the database
		const { error } = await supabase
			.from("advertisements")
			.delete()
			.eq("id", id);

		if (error) throw error;

		return {
			success: true,
			message: "Ad deleted successfully.",
		};
	} catch (error) {
		console.error("Error deleting advertisement:", error);
		return {
			success: false,
			message: "Failed to delete advertisement.",
		};
	}
}


export async function getCarrierLink(): Promise<CarrierLink | null> {
	const { data, error } = await supabase
		.from("carrier_links")
		.select("*")
		.order("created_at", { ascending: false })
		.limit(1)
		.single();

	if (error) {
		console.error("Error fetching carrier link:", error);
		return null;
	}

	return {
		id: data.id,
		url: data.url,
		createdAt: data.created_at,
	};
}

export async function updateCarrierLink(url: string): Promise<void> {
	// Delete existing links (optional for single-link use case)
	await supabase.from("carrier_links").delete().neq("id", "");

	const { error } = await supabase.from("carrier_links").insert([{ url }]);
	if (error) {
		console.error("Error updating carrier link:", error);
		throw error;
	}
}
export { supabase };

