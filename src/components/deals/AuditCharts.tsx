import {
  AUDIT_BLUE, AUDIT_TRACK, TOUCHPOINT_STATE, type AuditChartData,
} from "@/lib/audit-charts";

/**
 * The audit's graphics. Every chart is a single-series magnitude read or a
 * status distribution, so none carries a colour legend on its own: identity is
 * always spelled out in text beside the mark.
 */

/** The overall score as an arc, with the figure itself as the headline. */
export function ScoreGauge({ score, size = 156 }: { score: number; size?: number }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Three quarters of a circle, opened at the bottom so the number sits clear.
  const sweep = 0.75;
  const track = circumference * sweep;
  const filled = track * Math.max(0, Math.min(100, score)) / 100;
  return (
    <figure className="m-0 inline-flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Overall brand score ${score} out of 100`}>
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.28)"
            strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${track} ${circumference}`}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ffffff"
            strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`}
          />
        </g>
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="fill-white" style={{ fontSize: 40, fontWeight: 700 }}>{score}</text>
        <text x={size / 2} y={size / 2 + 26} textAnchor="middle" className="fill-white/70" style={{ fontSize: 12 }}>out of 100</text>
      </svg>
    </figure>
  );
}

/**
 * Scorecard as a bar chart. One series, so no legend: each bar is named on its
 * own row and labelled with its own value.
 */
export function ScoreBars({ scores }: { scores: AuditChartData["scores"] }) {
  if (!scores.length) return null;
  return (
    <div className="space-y-4">
      {scores.map((item) => (
        <div key={item.area}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-[#07133B]">{item.area}</span>
            <span className="text-sm font-bold tabular-nums text-[#0A4FE8]">{item.score}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: AUDIT_TRACK }}>
            <div className="h-full rounded-full" style={{ width: `${item.score}%`, background: AUDIT_BLUE }} />
          </div>
          {item.explanation && <p className="mt-2 text-xs leading-5 text-slate-500">{item.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * How the touchpoints sit overall: one stacked bar, a 2px surface gap between
 * segments, and a legend that names every state and its count so the colour is
 * never the only thing saying what a segment means.
 */
export function TouchpointHealth({ data }: { data: AuditChartData }) {
  if (!data.touchpointTotal) return null;
  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#07133B]">Touchpoint health</span>
        <span className="text-xs text-slate-500">
          <strong className="text-[#07133B]">{data.healthy}</strong> of {data.touchpointTotal} working as they should
        </span>
      </figcaption>
      <div className="mt-3 flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-slate-100">
        {data.states.map((state) => (
          <div
            key={state.key}
            title={`${state.label}: ${state.count} of ${data.touchpointTotal}`}
            style={{ width: `${state.share * 100}%`, background: state.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {data.states.map((state) => (
          <li key={state.key} className="inline-flex items-center gap-2 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: state.color }} aria-hidden />
            <span>{state.label}</span>
            <strong className="tabular-nums text-[#07133B]">{state.count}</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Findings by severity. Three counts, so tiles rather than a chart. */
export function SeverityTiles({ data }: { data: AuditChartData }) {
  if (!data.findingsTotal) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {data.severities.map((severity) => (
        <div key={severity.key} className="rounded-2xl border border-slate-200 p-4">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: severity.color }} aria-hidden />
            {severity.label} severity
          </span>
          <strong className="mt-1 block text-3xl tabular-nums text-[#07133B]">{severity.count}</strong>
          <span className="text-xs text-slate-400">of {data.findingsTotal} findings</span>
        </div>
      ))}
    </div>
  );
}

/** The state chip used beside each touchpoint, so the label always travels with the colour. */
export function StateChip({ state }: { state: keyof typeof TOUCHPOINT_STATE }) {
  const shape = TOUCHPOINT_STATE[state] || TOUCHPOINT_STATE.unknown;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
      <span className="h-2 w-2 rounded-full" style={{ background: shape.color }} aria-hidden />
      {shape.label}
    </span>
  );
}
