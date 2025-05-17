/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export function FeaturedWorksList() {
  const [brands, setBrands] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFeaturedWorks = async () => {
      try {
        setIsLoading(true);

        // Get selected brands
        const { data: brandRows, error } = await supabase
          .from("brands")
          .select("name, order")
          .eq("selected", true)
          .order("order");

        if (error) throw error;

        if (!brandRows?.length) {
          setBrands([]);
          return;
        }

        const titles = brandRows.map((b) => b.name);

        // Get corresponding works
        const { data: works, error: worksError } = await supabase
          .from("works")
          .select("*")
          .in("title", titles);

        if (worksError) throw worksError;

        // Match works to brand order
        const ordered = titles
          .map((title) => works.find((w) => w.title === title))
          .filter(Boolean);

        setBrands(ordered);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load featured works",
          variant: "destructive",
        });
        setBrands([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeaturedWorks();
  }, []);

  return (
    <Card className="bg-white text-[#151D48] border-none rounded-lg p-4 mt-4">
      <h2 className="text-2xl font-bold mb-4">Featured Works</h2>

      <div className="space-y-2">
        {isLoading ? (
          <div className="py-4 text-center text-gray-400">Loading...</div>
        ) : brands.length === 0 ? (
          <div className="py-4 text-center text-gray-400">No featured works</div>
        ) : (
          brands.map((work) => (
            <div
              key={work.id}
              className="flex text-lg font-semibold justify-between items-center p-2 hover:bg-[#151D48] hover:text-white rounded"
            >
              <span>{work.title}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}