"use client";

import { useCallback, useEffect, useState } from "react";
import { appToast } from "@/lib/app-notify";
import { Loader2, Save, Plus, Trash2, X, CheckCircle2, Info } from "lucide-react";

export interface BankQuestion {
  prompt: string;
  options: string[];
  correct_index: number;
}

export const SCREENING_EXPECTED = 10;
const ACCENT = "#0A4FE8";
function blankQuestion(): BankQuestion {
  return { prompt: "", options: ["", "", "", ""], correct_index: 0 };
}

/**
 * Shared objective-question editor for a single role. Used by the admin
 * Question Bank and the team-member /team/screening page - they differ only in
 * which load/save endpoints they hit.
 */
export default function QuestionBankEditor({
  roleId,
  loadUrl,
  saveUrl,
}: {
  roleId: string;
  loadUrl: (roleId: string) => string;
  saveUrl: string;
}) {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (rid: string) => {
      if (!rid) return;
      setLoading(true);
      try {
        const res = await fetch(loadUrl(rid), { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const qs: BankQuestion[] = (data?.questions || []).map(
          (q: { prompt: string; options: string[]; correct_index: number }) => ({
            prompt: q.prompt,
            options: q.options.length ? q.options : ["", ""],
            correct_index: q.correct_index,
          }),
        );
        setQuestions(qs.length ? qs : [blankQuestion()]);
      } finally {
        setLoading(false);
      }
    },
    [loadUrl],
  );

  useEffect(() => {
    if (roleId) load(roleId);
  }, [roleId, load]);

  const update = (i: number, patch: Partial<BankQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? val : o)) } : q)));
  const addOption = (qi: number) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === qi && q.options.length < 6 ? { ...q, options: [...q.options, ""] } : q)));
  const removeOption = (qi: number, oi: number) =>
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qi || q.options.length <= 2) return q;
        const options = q.options.filter((_, j) => j !== oi);
        const correct_index = q.correct_index >= options.length ? options.length - 1 : q.correct_index;
        return { ...q, options, correct_index };
      }),
    );
  const addQuestion = () => setQuestions((qs) => (qs.length >= SCREENING_EXPECTED ? qs : [...qs, blankQuestion()]));
  const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_id: roleId, questions }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) appToast({ message: `Saved ${data.count} question(s)`, kind: "success" });
      else appToast({ message: data?.error || "Save failed", kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const filled = questions.filter((q) => q.prompt.trim()).length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className={`text-sm font-semibold ${filled === SCREENING_EXPECTED ? "text-emerald-600" : "text-gray-400"}`}>
          {filled}/{SCREENING_EXPECTED} questions
        </span>
        <button
          onClick={save}
          disabled={saving || !roleId}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: ACCENT }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save question bank
        </button>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-[#0A4FE8]">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          Set exactly {SCREENING_EXPECTED} questions for a complete test. Each needs 2–6 options and one correct answer. Correct
          answers are never sent to the candidate&apos;s browser.
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((qn, qi) => (
            <div key={qi} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-[#0A4FE8]">{qi + 1}</span>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(qi)} className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-rose-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <textarea
                value={qn.prompt}
                onChange={(e) => update(qi, { prompt: e.target.value })}
                rows={2}
                placeholder="Question prompt…"
                className="mb-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[#0A4FE8]"
              />
              <div className="space-y-2">
                {qn.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      onClick={() => update(qi, { correct_index: oi })}
                      title="Mark as correct answer"
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition ${
                        qn.correct_index === oi ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-200 text-gray-400 hover:border-emerald-300"
                      }`}
                    >
                      {qn.correct_index === oi ? <CheckCircle2 className="h-4 w-4" /> : String.fromCharCode(65 + oi)}
                    </button>
                    <input
                      value={opt}
                      onChange={(e) => updateOption(qi, oi, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]"
                    />
                    {qn.options.length > 2 && (
                      <button onClick={() => removeOption(qi, oi)} className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-rose-500">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {qn.options.length < 6 && (
                <button onClick={() => addOption(qi)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8] hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add option
                </button>
              )}
              <p className="mt-2 text-[11px] text-gray-400">Tap the circle to mark the correct answer.</p>
            </div>
          ))}

          {questions.length < SCREENING_EXPECTED && (
            <button
              onClick={addQuestion}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-4 text-sm font-semibold text-gray-400 hover:border-[#0A4FE8]/40 hover:text-[#0A4FE8]"
            >
              <Plus className="h-4 w-4" /> Add question ({questions.length}/{SCREENING_EXPECTED})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
