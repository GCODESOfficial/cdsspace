/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/constants";
import Link from "next/link";

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
  const [workCategory, setWorkCategory] = useState<{ name: string; slug: string } | null>(null);

  useEffect(() => {
    if (work?.category) {
      const category = CATEGORIES.find((cat) => cat.name === work.category);
      if (category) {
        setWorkCategory({ name: category.name, slug: category.slug });
      }
    }
  }, [work]);

  useEffect(() => {
    const id = params.id as string;
    if (id) {
      fetchWorkById(id);
    }
  }, [params.id]);

  async function fetchWorkById(id: string) {
    try {
      setLoading(true);
      setError(null);

      // Fetch single work by id
      const { data: workData, error: workError } = await supabase
        .from("works")
        .select("*")
        .eq("id", id)
        .single();

      if (workError) throw workError;
      if (!workData) {
        setError("Project not found.");
        toast.error("Project not found.");
        router.push("/admin");
        return;
      }

      setWork(workData);

      // Fetch related images
      const { data: imagesData, error: imagesError } = await supabase
        .from("work_images")
        .select("*")
        .eq("work_id", workData.id)
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
			  <div className="mx-auto mb-4 w-28 h-28  rounded-full overflow-hidden">
				<video
				  src="/loader.mp4"  // replace with your video path
				  autoPlay
				  loop
				  muted
				  playsInline
				  className="rounded-full object-fill h-24 w-24"
				/>
			  </div>
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
            onClick={() => router.push("/")}
          >
            Back to Home
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
            onClick={() => router.push("/")}
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-40 text-black p-6">
      <div className="max-w-6xl mx-auto pt-28">
        {/* Breadcrumb */}
        <div className="text-sm md:text-base">
          <Link href="/Works" className="hover:underline mr-1">Works</Link>
          &gt;
          {workCategory && (
            <>
              <Link
                href={`/Works/categories/${workCategory.slug}`}
                className="hover:underline ml-1 font-medium"
              >
                {workCategory.name}
              </Link>
            </>
          )}
        </div>

        <div className="space-y-6 md:flex justify-between max-w-6xl border-b pt-18 pb-40">
          <h1 className="text-5xl font-black">{work.title}</h1>
          <div className="text-right md:mt-44 mt-32 max-w-md">
            <p className="text-black whitespace-pre-line">
              {work.description || "No description provided."}
            </p>
          </div>
        </div>

        <div className="pt-40">
          {images.length > 0 ? (
            <div>
              {gridRows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-2"
                  style={{ gap: "1rem" }}
                >
                  {row.items.map(({ image, index, isFullWidth }) => (
                    <div
                      key={index}
                      className={`relative overflow-hidden ${
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
                        className="w-full md:h-full object-cover"
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
