/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, Pencil, X, Save } from "lucide-react";
import Image from "next/image";
import BulkActionBar from "@/components/admin/BulkActionBar";

interface Testimonial {
  id: string;
  name: string;
  review: string;
  picture_url: string | null;
  created_at: string;
}

export default function TestimonialsAdmin() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [name, setName] = useState("");
  const [review, setReview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editReview, setEditReview] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => { fetchTestimonials(); }, []);

  async function fetchTestimonials() {
    setIsFetching(true);
    const { data, error } = await supabase
      .from("testimonials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: "Failed to fetch testimonials", variant: "destructive" });
    } else {
      setTestimonials(data || []);
    }
    setIsFetching(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sel = e.target.files?.[0] || null;
    setFile(sel);
    setPreview(sel ? URL.createObjectURL(sel) : null);
  }

  async function uploadPicture(f: File): Promise<string> {
    const fileExt = f.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error } = await supabase.storage.from("testimonials").upload(fileName, f, { contentType: f.type });
    if (error) throw error;
    const { data } = supabase.storage.from("testimonials").getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !review.trim()) {
      toast({ title: "Missing fields", description: "Name and review are required.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    let picture_url: string | null = null;
    if (file) {
      try { picture_url = await uploadPicture(file); }
      catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); setIsLoading(false); return; }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("testimonials").insert({ name: name.trim(), review: review.trim(), picture_url });
    if (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to add testimonial",
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Testimonial added" });
      setName(""); setReview(""); setFile(null); setPreview(null);
      fetchTestimonials();
    }
    setIsLoading(false);
  }

  // Edit handlers
  function startEdit(t: Testimonial) {
    setEditId(t.id);
    setEditName(t.name);
    setEditReview(t.review);
    setEditFile(null);
    setEditPreview(t.picture_url);
  }

  function cancelEdit() {
    setEditId(null); setEditName(""); setEditReview(""); setEditFile(null); setEditPreview(null);
  }

  function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sel = e.target.files?.[0] || null;
    setEditFile(sel);
    if (sel) setEditPreview(URL.createObjectURL(sel));
  }

  async function handleSaveEdit() {
    if (!editId || !editName.trim() || !editReview.trim()) return;
    setIsSaving(true);

    const updates: Record<string, any> = {
      name: editName.trim(),
      review: editReview.trim(),
    };

    // Upload new picture if changed
    if (editFile) {
      try {
        const newUrl = await uploadPicture(editFile);
        // Delete old picture
        const old = testimonials.find(t => t.id === editId);
        if (old?.picture_url) {
          const path = old.picture_url.split("/testimonials/").pop();
          if (path) await supabase.storage.from("testimonials").remove([path]);
        }
        updates.picture_url = newUrl;
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
        setIsSaving(false);
        return;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("testimonials").update(updates).eq("id", editId);
    if (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to update",
        variant: "destructive",
      });
    } else {
      toast({ title: "Updated", description: "Testimonial updated" });
      cancelEdit();
      fetchTestimonials();
    }
    setIsSaving(false);
  }

  async function handleDelete(t: Testimonial) {
    if (t.picture_url) {
      const path = t.picture_url.split("/testimonials/").pop();
      if (path) await supabase.storage.from("testimonials").remove([path]);
    }
    const { error } = await supabase.from("testimonials").delete().eq("id", t.id);
    if (!error) { toast({ title: "Deleted", description: "Testimonial removed" }); fetchTestimonials(); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    selected.size === testimonials.length ? setSelected(new Set()) : setSelected(new Set(testimonials.map(t => t.id)));
  }
  async function handleBulkDelete() {
    const ids = Array.from(selected);
    const toDelete = testimonials.filter(t => ids.includes(t.id));
    const paths = toDelete.map(t => t.picture_url?.split("/testimonials/").pop()).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("testimonials").remove(paths);
    await supabase.from("testimonials").delete().in("id", ids);
    setSelected(new Set());
    fetchTestimonials();
    toast({ title: "Deleted", description: `${ids.length} testimonial(s) removed` });
  }

  return (
    <div className="p-8 max-w-[1000px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Manage</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Testimonials</h1>
      </div>

      {/* Add Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
        <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-5">Add New Testimonial</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            {preview ? (
              <img src={preview} alt="Preview" className="w-14 h-14 rounded-full object-cover border-2 border-blue-200" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                <Plus className="w-5 h-5" />
              </div>
            )}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Client Photo (1:1)</label>
              <input type="file" accept="image/*" onChange={handleFileChange}
                className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-gray-200 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer file:transition" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Client Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Doe"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Review</label>
            <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="What the client said..." rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
          </div>
          <button type="submit" disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isLoading ? "Adding..." : "Add Testimonial"}
          </button>
        </form>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}
          actions={[{ label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: handleBulkDelete, variant: "danger" as const }]} />
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          {testimonials.length > 0 && (
            <input type="checkbox" checked={selected.size === testimonials.length && testimonials.length > 0} onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
          )}
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">
            All Testimonials <span className="text-gray-400 font-normal">({testimonials.length})</span>
          </h2>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : testimonials.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No testimonials yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {testimonials.map((t) => (
              <div key={t.id}>
                {editId === t.id ? (
                  /* ── EDIT MODE ── */
                  <div className="px-6 py-5 bg-blue-50/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-[#0A4FE8]">Editing Testimonial</p>
                      <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                    </div>

                    {/* Picture */}
                    <div className="flex items-center gap-4">
                      {editPreview ? (
                        <img src={editPreview} alt="Preview" className="w-14 h-14 rounded-full object-cover border-2 border-blue-300" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-[#0A4FE8] text-lg font-bold">
                          {editName.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Update Photo</label>
                        <input type="file" accept="image/*" onChange={handleEditFileChange}
                          className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-gray-200 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer" />
                      </div>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
                    </div>

                    {/* Review */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Review</label>
                      <textarea value={editReview} onChange={(e) => setEditReview(e.target.value)} rows={3}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>
                      <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── VIEW MODE ── */
                  <div className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50/50 transition">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer flex-shrink-0" />
                    {t.picture_url ? (
                      <Image src={t.picture_url} alt={t.name} width={44} height={44}
                        className="rounded-full object-cover w-11 h-11 flex-shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center text-[#0A4FE8] text-sm font-bold flex-shrink-0">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#0D1B39]">{t.name}</p>
                      <p className="text-gray-500 text-[13px] mt-0.5 line-clamp-2">{t.review}</p>
                      <p className="text-gray-300 text-[11px] mt-1.5">{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(t)}
                        className="p-2 rounded-lg text-gray-300 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(t)}
                        className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
