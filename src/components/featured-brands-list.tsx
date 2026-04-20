/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Star } from "lucide-react";

export function FeaturedWorksList() {
  const [brands, setBrands] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFeaturedWorks = async () => {
      try {
        setIsLoading(true);
        const { data: brandRows, error } = await supabase
          .from("brands")
          .select("name, order")
          .eq("selected", true)
          .order("order");

        if (error) throw error;
        if (!brandRows?.length) { setBrands([]); return; }

        const titles = brandRows.map((b) => b.name);
        const { data: works, error: worksError } = await supabase
          .from("works")
          .select("*")
          .in("title", titles);

        if (worksError) throw worksError;

        const ordered = titles
          .map((title) => works.find((w) => w.title === title))
          .filter(Boolean);

        setBrands(ordered);
      } catch (error) {
        toast({ title: "Error", description: "Failed to load featured works", variant: "destructive" });
        setBrands([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeaturedWorks();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <Star className="w-4 h-4 text-amber-500" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#0D1B39]">Featured Works</h2>
      </div>

      <div className="space-y-1">
        {isLoading ? (
          <p className="text-center text-gray-400 text-sm py-8">Loading...</p>
        ) : brands.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No featured works</p>
        ) : (
          brands.map((work, i) => (
            <div
              key={work.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50/50 transition group"
            >
              <span className="w-6 h-6 rounded-md bg-gray-100 text-gray-400 text-[11px] font-semibold flex items-center justify-center group-hover:bg-[#0A4FE8] group-hover:text-white transition">
                {i + 1}
              </span>
              <span className="text-[13px] font-medium text-[#0D1B39] truncate">
                {work.title}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
