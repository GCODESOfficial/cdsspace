"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Plus, Building2, Loader2, X, Check } from "lucide-react";

export interface Client {
  id: string;
  name: string;
  brand_name: string | null;
  email: string | null;
  industry: string | null;
}

interface ClientPickerProps {
  value?: string;       // selected client name (controlled)
  onSelect: (client: Client) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Reusable Client/Brand picker with autocomplete + "Add new" prompt.
 * - Type to search existing clients
 * - If no match found, click "Add new" to open an inline create form
 */
export default function ClientPicker({ value = "", onSelect, placeholder = "Search client or brand...", className = "" }: ClientPickerProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Add form fields
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newIndustry, setNewIndustry] = useState("");

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Search debounce
  useEffect(() => {
    if (!isOpen || showAddForm) return;
    const t = setTimeout(async () => {
      setIsLoading(true);
      let q = supabase
        .from("clients")
        .select("id, name, brand_name, email, industry")
        .order("created_at", { ascending: false })
        .limit(15);
      if (query.trim()) {
        q = q.or(`name.ilike.%${query}%,brand_name.ilike.%${query}%`);
      }
      const { data } = await q;
      setResults(data || []);
      setIsLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, isOpen, showAddForm]);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handlePickExisting(client: Client) {
    onSelect(client);
    setQuery(client.brand_name || client.name);
    setIsOpen(false);
  }

  function openAddForm() {
    setShowAddForm(true);
    setNewName(query);
    setNewBrand("");
    setNewEmail("");
    setNewIndustry("");
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);

    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: newName.trim(),
        brand_name: newBrand.trim() || null,
        email: newEmail.trim() || null,
        industry: newIndustry.trim() || null,
      })
      .select()
      .single();

    setIsCreating(false);

    if (data && !error) {
      onSelect(data);
      setQuery(data.brand_name || data.name);
      setShowAddForm(false);
      setIsOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setShowAddForm(false); }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setIsOpen(true); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-300 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden">
          {showAddForm ? (
            /* Add new client form */
            <form onSubmit={handleCreateClient} className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-semibold text-[#0D1B39] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#0A4FE8]" /> Add New Client
                </p>
                <button type="button" onClick={() => setShowAddForm(false)} className="p-1 rounded text-gray-300 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Client Name *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="John Doe / Acme Inc."
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Brand Name</label>
                <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="(Optional)"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@..."
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Industry</label>
                  <input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} placeholder="e.g. Tech"
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                </div>
              </div>
              <button type="submit" disabled={isCreating || !newName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-lg hover:bg-[#083EC0] transition disabled:opacity-50">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isCreating ? "Creating..." : "Create & Select"}
              </button>
            </form>
          ) : (
            /* Search results */
            <div>
              {isLoading ? (
                <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-400 mx-auto" /></div>
              ) : results.length === 0 ? (
                <div className="py-6 text-center px-4">
                  <Building2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-[13px] text-gray-500 mb-3">No clients found{query && ` for "${query}"`}</p>
                  <button type="button" onClick={openAddForm}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0A4FE8] text-white text-[12px] font-medium rounded-lg hover:bg-[#083EC0] transition">
                    <Plus className="w-3.5 h-3.5" /> Add new client
                  </button>
                </div>
              ) : (
                <>
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {results.map((c) => (
                      <button key={c.id} type="button" onClick={() => handlePickExisting(c)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/60 transition text-left">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-[#0A4FE8]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#0D1B39] truncate">
                            {c.brand_name || c.name}
                          </p>
                          {c.brand_name && (
                            <p className="text-[11px] text-gray-400 truncate">{c.name}</p>
                          )}
                        </div>
                        {c.industry && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium">
                            {c.industry}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 p-2">
                    <button type="button" onClick={openAddForm}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-[#0A4FE8] hover:bg-blue-50 transition">
                      <Plus className="w-3.5 h-3.5" /> Add new client
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
