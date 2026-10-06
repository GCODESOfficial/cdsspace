import { ExternalLink } from "lucide-react";
import type { DealAuditContent } from "@/lib/deals-ai";
import { auditChartData } from "@/lib/audit-charts";
import { ScoreBars, ScoreGauge, SeverityTiles, StateChip, TouchpointHealth } from "@/components/deals/AuditCharts";

export type AuditReportData = {
  brand_name: string;
  target_url: string;
  overall_score: number | null;
  content: DealAuditContent;
};

/**
 * The audit as the client sees it. Shared by the admin workspace and the public
 * link so a reviewer and a client are always reading the same document.
 */
export default function AuditReport({ audit }: { audit: AuditReportData }) {
  const content = audit.content || ({} as DealAuditContent);
  const chart = auditChartData(content, audit.overall_score);
  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-[24px] bg-[#0A4FE8] p-6 text-white shadow-[0_18px_50px_rgba(10,79,232,0.16)] sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-100">Evidence-led public brand audit</p>
            <h2 className="mt-2 text-3xl font-bold">{audit.brand_name}</h2>
            {content.verdict && <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-white">{content.verdict}</p>}
            <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">{content.summary}</p>
          </div>
          {audit.overall_score !== null && <ScoreGauge score={chart.score} />}
        </div>
      </div>

      {(content.context || content.visual_review?.notes) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {content.context && <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#07133B]">What this company needs</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{content.context}</p>
          </div>}
          {content.visual_review?.notes && <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#07133B]">How the site looks to a visitor</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{content.visual_review.notes}</p>
            <p className="mt-3 text-xs text-slate-400">{content.visual_review.checked ? "Checked in a real browser on a laptop and a phone." : "Not checked in a browser; confirm the design by eye."}</p>
          </div>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-[#07133B]">Scorecard</h3>
          <p className="mt-1 text-sm text-slate-500">Each area out of 100, strongest first.</p>
          <div className="mt-5"><ScoreBars scores={chart.scores} /></div>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-[#07133B]">What it can become</h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">{content.future_state}</p>
          <div className="mt-6 border-t border-slate-100 pt-5"><TouchpointHealth data={chart} /></div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {(content.metrics || []).slice(0, 6).map((metric) => (
              <div key={metric.label} className="rounded-2xl bg-[#F3F6FC] p-4">
                <strong className="text-2xl tabular-nums text-[#0A4FE8]">{metric.value}</strong>
                <span className="block text-xs text-slate-500">{metric.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(content.touchpoints || []).length > 0 && (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-[#07133B]">Every touchpoint</h3>
          <p className="mt-1 text-sm text-slate-500">Each place the brand is met before anyone speaks to you, judged on captured public evidence.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(content.touchpoints || []).map((touchpoint) => (
              <div key={touchpoint.key} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-[#07133B]">{touchpoint.label}</h4>
                  <StateChip state={touchpoint.state} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{touchpoint.observation}</p>
                {touchpoint.fix && <p className="mt-2 text-xs leading-5 text-slate-500"><strong className="text-slate-600">What to do:</strong> {touchpoint.fix}</p>}
                {touchpoint.evidence?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {touchpoint.evidence.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-[11px] font-semibold text-[#0A4FE8] hover:underline">
                        <ExternalLink className="h-3 w-3 shrink-0" />{url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-[#07133B]">Findings</h3>
        <div className="mt-4"><SeverityTiles data={chart} /></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(content.findings || []).map((finding, index) => (
            <a key={`${finding.title}-${index}`} href={finding.source_url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold text-[#07133B]">{finding.title}</h4>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${finding.severity === "high" ? "bg-rose-50 text-rose-700" : finding.severity === "medium" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{finding.severity}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">{finding.evidence}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8]"><ExternalLink className="h-3 w-3" /> Source</span>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-[#07133B]">Priority actions</h3>
        <div className="mt-4 space-y-3">
          {[...(content.recommendations || [])].sort((a, b) => a.priority - b.priority).map((item) => (
            <div key={`${item.priority}-${item.title}`} className="flex gap-4 rounded-2xl bg-[#F3F6FC] p-4">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0A4FE8] text-xs font-bold text-white">{item.priority}</div>
              <div>
                <h4 className="font-semibold text-[#07133B]">{item.title}</h4>
                <p className="mt-1 text-sm text-slate-600">{item.action}</p>
                <p className="mt-2 text-xs text-slate-400">Expected outcome: {item.expected_outcome}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
