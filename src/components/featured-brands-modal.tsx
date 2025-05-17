/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { MoveUp, MoveDown, Trash2 } from "lucide-react";

interface FeaturedWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeaturedWorksModal({ isOpen, onClose }: FeaturedWorksModalProps) {
  const [works, setWorks] = useState<any[]>([]);
  const [selectedWorks, setSelectedWorks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchLatestWorks();
      loadSelectedWorksFromSupabase();
    }
  }, [isOpen]);

  const fetchLatestWorks = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("works")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setWorks(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load works",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedWorksFromSupabase = async () => {
    try {
      const { data: brandRows, error } = await supabase
        .from("brands")
        .select("name, order")
        .eq("selected", true)
        .order("order");

      if (error) throw error;
      if (!brandRows?.length) return;

      const titles = brandRows.map((b) => b.name);

      const { data: matchingWorks, error: worksError } = await supabase
        .from("works")
        .select("*")
        .in("title", titles);

      if (worksError) throw worksError;

      const orderedWorks = titles
        .map((title) => matchingWorks.find((w) => w.title === title))
        .filter(Boolean);

      setSelectedWorks(orderedWorks);
    } catch (e) {
      console.error("Failed to load featured works from Supabase", e);
    }
  };

  const handleSelectionChange = (work: any, checked: boolean) => {
    setSelectedWorks((prevSelected) => {
      if (checked && prevSelected.length < 8) {
        return [...prevSelected, work];
      } else {
        return prevSelected.filter((w) => w.id !== work.id);
      }
    });
  };

  const handleSaveChanges = async () => {
    try {
      const { error: deleteError } = await supabase
        .from("brands")
        .delete()
        .eq("selected", true);

      if (deleteError) throw deleteError;

      const inserts = selectedWorks.map((work, index) => ({
        name: work.title,
        order: index + 1,
        selected: true,
        created_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("brands")
        .insert(inserts);

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: "Featured works updated successfully",
      });

      onClose();
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newWorks = [...selectedWorks];
    [newWorks[index - 1], newWorks[index]] = [newWorks[index], newWorks[index - 1]];
    setSelectedWorks(newWorks);
  };

  const handleMoveDown = (index: number) => {
    if (index === selectedWorks.length - 1) return;
    const newWorks = [...selectedWorks];
    [newWorks[index + 1], newWorks[index]] = [newWorks[index], newWorks[index + 1]];
    setSelectedWorks(newWorks);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white text-[#151D48]">
        <DialogHeader>
          <DialogTitle>Manage Featured Works</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {works.length === 0 ? (
            <p className="text-center py-4 text-gray-400">No works found</p>
          ) : (
            <div className="space-y-2">
              {works.map((work) => {
                const isSelected = selectedWorks.some((w) => w.id === work.id);
                const index = selectedWorks.findIndex((w) => w.id === work.id);

                return (
                  <div
                    key={work.id}
                    className="bg-[#D9D9D9] p-3 rounded-md flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`work-${work.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleSelectionChange(work, !!checked)
                        }
                      />
                      <label htmlFor={`work-${work.id}`} className="flex-1">
                        {work.title}
                      </label>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMoveUp(index)}
                          disabled={isLoading || index === 0}
                          className="h-8 w-8 p-0"
                        >
                          <MoveUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMoveDown(index)}
                          disabled={isLoading || index === selectedWorks.length - 1}
                          className="h-8 w-8 p-0"
                        >
                          <MoveDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleSelectionChange(work, false)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-[#08129C]" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="bg-transparent rounded-lg border-[#072056] hover:text-white hover:bg-[#08129C]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSaveChanges}
            className="bg-gradient-to-r from-[#08129C] to-[#072056] text-white rounded-lg hover:shadow-[0_0_15px_4px_rgba(255,255,255,0.3)] transition-shadow duration-300"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}