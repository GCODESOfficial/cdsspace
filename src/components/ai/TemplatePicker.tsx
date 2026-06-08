"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, LayoutTemplate, Search, FilePlus2 } from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

export interface Template {
  id: string;
  slug: string;
  title: string;
  category: string;
  emoji: string;
  description: string | null;
  body_template: string;
  ai_seed_prompt: string | null;
  variables: { key: string; label: string; required?: boolean }[];
  times_used: number;
  is_builtin: boolean;
}

export function TemplatePicker({
  open,
  category,
  onClose,
  onPick,
}: {
  open: boolean;
  category?: string;
  onClose: () => void;
  onPick: (result: { title: string; body: string; ai_seed_prompt: string | null }) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [using, setUsing] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/ai/templates${category ? `?category=${category}` : ""}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setTemplates(j.templates);
      })
      .finally(() => setLoading(false));
  }, [open, category]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter(
      (t) => !q || t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  async function use(t: Template) {
    if (t.variables?.length) {
      setSelected(t);
      setValues({});
      return;
    }
    await instantiate(t, {});
  }

  async function instantiate(t: Template, vs: Record<string, string>) {
    setUsing(true);
    try {
      const r = await fetch(`/api/ai/templates/${t.slug}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: vs }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        appAlert(j.error || "Couldn't use template");
        return;
      }
      onPick({ title: j.title, body: j.body, ai_seed_prompt: j.ai_seed_prompt });
      onClose();
      setSelected(null);
    } finally {
      setUsing(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[28px] shadow-2xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A4FE8] to-[#7B3AED] text-white flex items-center justify-center">
              <LayoutTemplate className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-[#0D1B39]">Start from a template</p>
              <p className="text-[11px] text-gray-500">
                Pre-built scaffolds for meetings, briefs, post-mortems and more.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {selected ? (
          <VariablesStep
            template={selected}
            values={values}
            setValues={setValues}
            onBack={() => setSelected(null)}
            onSubmit={() => instantiate(selected, values)}
            busy={using}
          />
        ) : (
          <>
            <div className="px-4 sm:px-6 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 text-[#0A4FE8] animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-12 text-center text-gray-400 text-sm">No templates match.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => use(t)}
                      className="text-left p-4 rounded-2xl border border-gray-100 hover:border-[#0A4FE8]/40 hover:bg-blue-50/40 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-[28px] leading-none">{t.emoji}</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          {t.category}
                        </span>
                      </div>
                      <p className="text-[14px] font-bold text-[#0D1B39] mt-2">{t.title}</p>
                      {t.description && (
                        <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                      {t.times_used > 0 && (
                        <p className="text-[10px] text-gray-400 mt-2">
                          Used {t.times_used} time{t.times_used !== 1 ? "s" : ""}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VariablesStep({
  template,
  values,
  setValues,
  onBack,
  onSubmit,
  busy,
}: {
  template: Template;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onBack: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const canSubmit = template.variables.every(
    (v) => !v.required || (values[v.key] && values[v.key].trim())
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div>
          <p className="text-[13px] font-bold text-[#0D1B39]">
            {template.emoji} {template.title}
          </p>
          {template.description && (
            <p className="text-[12px] text-gray-500 mt-1">{template.description}</p>
          )}
        </div>

        {template.variables.map((v) => (
          <div key={v.key}>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              {v.label} {v.required && <span className="text-rose-400">*</span>}
            </label>
            <input
              value={values[v.key] || ""}
              onChange={(e) => setValues({ ...values, [v.key]: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        ))}
      </div>
      <div className="px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          className="w-full sm:w-auto px-3 py-2 rounded-xl text-[12px] text-gray-600 border border-gray-200 bg-white hover:bg-gray-100"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A4FE8] text-white text-[12px] font-semibold hover:bg-[#083EC0] transition disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
          Create doc
        </button>
      </div>
    </div>
  );
}
