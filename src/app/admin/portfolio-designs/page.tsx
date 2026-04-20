/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { INDUSTRY_CATEGORIES } from "@/lib/industry-categories";
import { Trash2, Loader2, Plus, Filter, ImagePlus, X, AlertCircle } from "lucide-react";
import Image from "next/image";
import BulkActionBar from "@/components/admin/BulkActionBar";

interface PortfolioDesign {
  id: string;
  title: string;
  image_url: string;
  category: string;
  created_at: string;
}

interface QueuedFile {
  file: File;
  preview: string;
  error?: string;
}

const MAX_FILES = 10;
const MAX_SIZE_MB = 2;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function PortfolioDesignsPage() {
  const [designs, setDesigns] = useState<PortfolioDesign[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Form
  const [category, setCategory] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);

  const { toast } = useToast();

  useEffect(() => { fetchDesigns(); }, []);

  async function fetchDesigns() {
    setIsFetching(true);
    const { data } = await supabase.from("portfolio_designs").select("*").order("created_at", { ascending: false });
    setDesigns(data || []);
    setIsFetching(false);
  }

  function validateFile(file: File): string | undefined {
    if (file.size > MAX_SIZE_BYTES) return `${file.name} exceeds ${MAX_SIZE_MB}MB`;
    if (!file.type.startsWith("image/")) return `${file.name} is not an image`;
    return undefined;
  }

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_FILES - queuedFiles.length;
    if (files.length > remaining) {
      toast({ title: "Too many files", description: `You can add ${remaining} more (max ${MAX_FILES})`, variant: "destructive" });
    }

    const newFiles: QueuedFile[] = files.slice(0, remaining).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      error: validateFile(file),
    }));

    setQueuedFiles(prev => [...prev, ...newFiles]);
    e.target.value = "";
  }

  function removeQueuedFile(index: number) {
    setQueuedFiles(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const validFiles = queuedFiles.filter(f => !f.error);
    if (!category) {
      toast({ title: "Missing category", description: "Select an industry category", variant: "destructive" });
      return;
    }
    if (validFiles.length === 0) {
      toast({ title: "No valid files", description: "Add at least one valid image", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    let uploaded = 0;

    for (const queued of validFiles) {
      const fileExt = queued.file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("portfolio-designs")
        .upload(fileName, queued.file, { contentType: queued.file.type });

      if (uploadError) {
        toast({ title: "Upload failed", description: `${queued.file.name}: ${uploadError.message}`, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("portfolio-designs").getPublicUrl(fileName);
      const title = queued.file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

      await supabase.from("portfolio_designs").insert({
        title,
        image_url: urlData.publicUrl,
        category,
      });

      uploaded++;
      setUploadProgress(Math.round((uploaded / validFiles.length) * 100));
    }

    toast({ title: "Done", description: `${uploaded} design${uploaded > 1 ? "s" : ""} uploaded` });
    setQueuedFiles([]);
    setCategory("");
    setShowForm(false);
    setUploadProgress(0);
    setIsUploading(false);
    fetchDesigns();
  }

  async function handleDelete(d: PortfolioDesign) {
    const path = d.image_url.split("/portfolio-designs/").pop();
    if (path) await supabase.storage.from("portfolio-designs").remove([path]);
    await supabase.from("portfolio_designs").delete().eq("id", d.id);
    fetchDesigns();
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} designs?`)) return;
    const ids = Array.from(selected);
    const toDelete = designs.filter(d => ids.includes(d.id));
    const paths = toDelete.map(d => d.image_url.split("/portfolio-designs/").pop()).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("portfolio-designs").remove(paths);
    await supabase.from("portfolio_designs").delete().in("id", ids);
    setSelected(new Set());
    fetchDesigns();
    toast({ title: "Deleted", description: `${ids.length} designs removed` });
  }

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const filtered = filterCategory === "all" ? designs : designs.filter(d => d.category === filterCategory);
  const categoryCounts = designs.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Content</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Portfolio Designs</h1>
          <p className="text-gray-400 text-[13px] mt-1">Upload social media designs (1080×1080px, max 2MB each, up to 10 at once)</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
          {showForm ? "Cancel" : <><ImagePlus className="w-4 h-4" /> Upload Designs</>}
        </button>
      </div>

      {/* Upload Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <form onSubmit={handleUpload} className="space-y-5">
            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Industry Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full max-w-sm px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                <option value="">Select category</option>
                {INDUSTRY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Drop Zone */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Design Images <span className="text-gray-300">({queuedFiles.length}/{MAX_FILES})</span>
              </label>
              <label className={`flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed transition cursor-pointer ${
                queuedFiles.length >= MAX_FILES ? "border-gray-200 bg-gray-50 cursor-not-allowed" : "border-gray-300 bg-gray-50 hover:border-[#0A4FE8] hover:bg-blue-50/30"
              }`}>
                <ImagePlus className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-500 font-medium">
                  {queuedFiles.length >= MAX_FILES ? "Maximum files reached" : "Click to select images (1080×1080, max 2MB)"}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">Up to {MAX_FILES} images at once</p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilesChange}
                  disabled={queuedFiles.length >= MAX_FILES}
                  className="hidden"
                />
              </label>
            </div>

            {/* Queued Files Preview */}
            {queuedFiles.length > 0 && (
              <div className="grid grid-cols-5 gap-3">
                {queuedFiles.map((q, i) => (
                  <div key={i} className={`relative rounded-xl overflow-hidden border ${q.error ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                    <img src={q.preview} alt="" className="w-full aspect-square object-cover" />
                    {/* Remove button */}
                    <button type="button" onClick={() => removeQueuedFile(i)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/50 text-white hover:bg-red-500 transition">
                      <X className="w-3 h-3" />
                    </button>
                    {/* Error indicator */}
                    {q.error && (
                      <div className="absolute bottom-0 inset-x-0 bg-red-500 text-white text-[9px] px-2 py-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span className="truncate">{q.error}</span>
                      </div>
                    )}
                    {/* File size */}
                    {!q.error && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[10px] px-2 py-1 text-center">
                        {(q.file.size / 1024 / 1024).toFixed(1)}MB
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#0A4FE8] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-[12px] text-gray-500 text-center">Uploading... {uploadProgress}%</p>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={isUploading || queuedFiles.filter(f => !f.error).length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isUploading ? "Uploading..." : `Upload ${queuedFiles.filter(f => !f.error).length} Design${queuedFiles.filter(f => !f.error).length !== 1 ? "s" : ""}`}
            </button>
          </form>
        </div>
      )}

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}
          actions={[{ label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleBulkDelete, variant: "danger" as const }]} />
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <button onClick={() => setFilterCategory("all")}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${filterCategory === "all" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200"}`}>
          All ({designs.length})
        </button>
        {INDUSTRY_CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilterCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${filterCategory === c ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200"}`}>
            {c} {categoryCounts[c] ? `(${categoryCounts[c]})` : ""}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isFetching ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ImagePlus className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No designs {filterCategory !== "all" ? `in "${filterCategory}"` : "yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(d => (
            <div key={d.id} className={`group relative rounded-2xl overflow-hidden border transition ${selected.has(d.id) ? "border-[#0A4FE8] ring-2 ring-blue-100" : "border-gray-100 hover:border-gray-200"}`}>
              <div className="absolute top-3 left-3 z-10">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)}
                  className="w-4 h-4 rounded border-white/50 text-[#0A4FE8] cursor-pointer shadow" />
              </div>
              <button onClick={() => handleDelete(d)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/40 text-white/80 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="aspect-square relative">
                <Image src={d.image_url} alt={d.title} fill className="object-cover" />
              </div>
              <div className="p-3 bg-white">
                <p className="text-[13px] font-medium text-[#0D1B39] truncate">{d.title}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#0A4FE8] text-[10px] font-medium">{d.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
