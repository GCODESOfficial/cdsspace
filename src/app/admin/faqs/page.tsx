"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, Pencil, Save, X, GripVertical, HelpCircle } from "lucide-react";
import BulkActionBar from "@/components/admin/BulkActionBar";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
}

export default function FAQsAdmin() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Form
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => { fetchFAQs(); }, []);

  async function fetchFAQs() {
    setIsFetching(true);
    const { data } = await supabase.from("faqs").select("*").order("sort_order", { ascending: true });
    setFaqs(data || []);
    setIsFetching(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      toast({ title: "Missing fields", description: "Both question and answer are required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const nextOrder = faqs.length > 0 ? Math.max(...faqs.map(f => f.sort_order)) + 1 : 1;
    const { error } = await supabase.from("faqs").insert({ question: question.trim(), answer: answer.trim(), sort_order: nextOrder });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added", description: "FAQ added" });
      setQuestion(""); setAnswer(""); setShowForm(false);
      fetchFAQs();
    }
    setIsLoading(false);
  }

  function startEdit(f: FAQ) { setEditId(f.id); setEditQuestion(f.question); setEditAnswer(f.answer); }
  function cancelEdit() { setEditId(null); setEditQuestion(""); setEditAnswer(""); }

  async function handleSaveEdit() {
    if (!editId || !editQuestion.trim() || !editAnswer.trim()) return;
    setIsSaving(true);
    const { error } = await supabase.from("faqs").update({ question: editQuestion.trim(), answer: editAnswer.trim() }).eq("id", editId);
    if (!error) { toast({ title: "Updated" }); cancelEdit(); fetchFAQs(); }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("faqs").delete().eq("id", id);
    fetchFAQs();
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} FAQs?`)) return;
    await supabase.from("faqs").delete().in("id", Array.from(selected));
    setSelected(new Set());
    fetchFAQs();
    toast({ title: "Deleted", description: `${selected.size} FAQs removed` });
  }

  async function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...faqs];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    updated.forEach((f, i) => f.sort_order = i + 1);
    for (const f of updated) {
      await supabase.from("faqs").update({ sort_order: f.sort_order }).eq("id", f.id);
    }
    setFaqs(updated);
  }

  async function moveDown(index: number) {
    if (index === faqs.length - 1) return;
    const updated = [...faqs];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updated.forEach((f, i) => f.sort_order = i + 1);
    for (const f of updated) {
      await supabase.from("faqs").update({ sort_order: f.sort_order }).eq("id", f.id);
    }
    setFaqs(updated);
  }

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  return (
    <div className="p-8 max-w-[900px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Content</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">FAQs</h1>
          <p className="text-gray-400 text-[13px] mt-1">Manage frequently asked questions shown on the landing page</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
          {showForm ? "Cancel" : <><Plus className="w-4 h-4" /> Add FAQ</>}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Question</label>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How quickly can we expect results?"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Answer</label>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write the answer..." rows={3}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
            </div>
            <button type="submit" disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isLoading ? "Adding..." : "Add FAQ"}
            </button>
          </form>
        </div>
      )}

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}
          actions={[{ label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleBulkDelete, variant: "danger" as const }]} />
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <HelpCircle className="w-4 h-4 text-[#0A4FE8]" />
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">
            All FAQs <span className="text-gray-400 font-normal">({faqs.length})</span>
          </h2>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : faqs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No FAQs yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {faqs.map((f, index) => (
              <div key={f.id}>
                {editId === f.id ? (
                  <div className="px-6 py-5 bg-blue-50/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-[#0A4FE8]">Editing FAQ</p>
                      <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Question</label>
                      <input value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Answer</label>
                      <textarea value={editAnswer} onChange={(e) => setEditAnswer(e.target.value)} rows={3}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 transition" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </button>
                      <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50/50 transition">
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)}
                      className="mt-1.5 w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer flex-shrink-0" />

                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                      <button onClick={() => moveUp(index)} disabled={index === 0}
                        className="p-0.5 rounded text-gray-300 hover:text-[#0A4FE8] disabled:opacity-20 transition text-[10px]">▲</button>
                      <button onClick={() => moveDown(index)} disabled={index === faqs.length - 1}
                        className="p-0.5 rounded text-gray-300 hover:text-[#0A4FE8] disabled:opacity-20 transition text-[10px]">▼</button>
                    </div>

                    {/* Number */}
                    <span className="w-6 h-6 rounded-md bg-gray-100 text-gray-400 text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#0D1B39]">{f.question}</p>
                      <p className="text-gray-500 text-[13px] mt-1 line-clamp-2">{f.answer}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(f)} className="p-2 rounded-lg text-gray-300 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(f.id)} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
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
