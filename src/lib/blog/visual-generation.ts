import type { BlogChartType, BlogVisualType } from "@/lib/blog/visual-options";

export interface BlogChartDatum {
  label: string;
  value: number;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, length: number) {
  const text = value.trim();
  return text.length > length ? `${text.slice(0, Math.max(1, length - 1)).trim()}…` : text;
}

export function parseBlogChartData(value: unknown): BlogChartDatum[] {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: BlogChartDatum[] = [];

  for (const line of lines) {
    const separator = line.includes(":") ? line.lastIndexOf(":")
      : line.includes("=") ? line.lastIndexOf("=")
        : line.lastIndexOf(",");
    if (separator <= 0) continue;

    const label = line.slice(0, separator).trim();
    const numericText = line.slice(separator + 1).replace(/[,%$£€₦\s]/g, "");
    const numericValue = Number(numericText);
    if (!label || !Number.isFinite(numericValue) || numericValue < 0) continue;
    rows.push({ label: truncate(label, 36), value: numericValue });
  }

  return rows.slice(0, 12);
}

function formatChartValue(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(value);
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function pieSlicePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

function chartColors(colors: string[]) {
  const usable = colors.filter((color) => /^#[0-9A-F]{6}$/i.test(color));
  return usable.length ? usable : ["#040B37", "#1C4ED1", "#F4F6FB", "#FFFFFF"];
}

export function renderBlogChartSvg(input: {
  title: string;
  focus: string;
  chartType: BlogChartType;
  data: BlogChartDatum[];
  colors: string[];
  location: "cover" | "inline";
}) {
  const width = 1536;
  const height = input.location === "cover" ? 864 : 1024;
  const palette = chartColors(input.colors);
  const ink = palette[0] || "#040B37";
  const primary = palette[1] || "#1C4ED1";
  const soft = palette[2] || "#F4F6FB";
  const background = palette[3] || "#FFFFFF";
  const seriesColors = [primary, ink, ...palette.slice(2), "#0575FF", "#16A34A", "#F47A00", "#7C3AED"];
  const title = escapeXml(truncate(input.title, 54));
  const focus = escapeXml(truncate(input.focus, 100));
  const data = input.data;
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const chartTop = input.location === "cover" ? 215 : 260;
  const chartBottom = height - 150;
  const chartLeft = 150;
  const chartRight = width - 100;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  let chart = "";

  if (input.chartType === "pie" || input.chartType === "donut") {
    const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
    const cx = 470;
    const cy = chartTop + chartHeight / 2;
    const radius = Math.min(chartHeight * 0.42, 270);
    let angle = -Math.PI / 2;
    chart = data.map((item, index) => {
      const portion = item.value / total;
      const nextAngle = angle + portion * Math.PI * 2;
      const path = pieSlicePath(cx, cy, radius, angle, nextAngle);
      const color = seriesColors[index % seriesColors.length];
      const segment = portion >= 0.999999
        ? `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`
        : `<path d="${path}" fill="${color}"/>`;
      angle = nextAngle;
      return segment;
    }).join("\n");
    if (input.chartType === "donut") {
      chart += `\n<circle cx="${cx}" cy="${cy}" r="${radius * 0.54}" fill="${background}"/>`;
      chart += `\n<text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${ink}" font-size="26" font-weight="700">TOTAL</text>`;
      chart += `\n<text x="${cx}" y="${cy + 48}" text-anchor="middle" fill="${ink}" font-size="46" font-weight="800">${escapeXml(formatChartValue(total))}</text>`;
    }
    chart += data.map((item, index) => {
      const y = chartTop + 20 + index * Math.min(62, chartHeight / Math.max(data.length, 1));
      const pct = `${((item.value / total) * 100).toFixed(item.value / total < 0.1 ? 1 : 0)}%`;
      return `<rect x="860" y="${y - 22}" width="28" height="28" rx="7" fill="${seriesColors[index % seriesColors.length]}"/>
<text x="910" y="${y}" fill="${ink}" font-size="25" font-weight="650">${escapeXml(truncate(item.label, 25))}</text>
<text x="1390" y="${y}" text-anchor="end" fill="${ink}" font-size="25" font-weight="800">${escapeXml(formatChartValue(item.value))} · ${pct}</text>`;
    }).join("\n");
  } else {
    const grid = Array.from({ length: 6 }, (_, index) => {
      const y = chartBottom - (index / 5) * chartHeight;
      const value = (index / 5) * maxValue;
      return `<line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="${ink}" stroke-opacity="0.10" stroke-width="2"/>
<text x="${chartLeft - 25}" y="${y + 8}" text-anchor="end" fill="${ink}" fill-opacity="0.58" font-size="22">${escapeXml(formatChartValue(value))}</text>`;
    }).join("\n");

    const step = chartWidth / data.length;
    const points = data.map((item, index) => ({
      x: chartLeft + step * index + step / 2,
      y: chartBottom - (item.value / maxValue) * chartHeight,
      ...item,
    }));
    const labels = points.map((point) => `<text x="${point.x}" y="${chartBottom + 42}" text-anchor="middle" fill="${ink}" fill-opacity="0.72" font-size="20">${escapeXml(truncate(point.label, 13))}</text>`).join("\n");

    if (input.chartType === "bar") {
      const barWidth = Math.max(24, Math.min(110, step * 0.62));
      chart = grid + points.map((point, index) => {
        const barHeight = chartBottom - point.y;
        return `<rect x="${point.x - barWidth / 2}" y="${point.y}" width="${barWidth}" height="${barHeight}" rx="14" fill="${seriesColors[index % seriesColors.length]}"/>
<text x="${point.x}" y="${Math.max(chartTop + 24, point.y - 16)}" text-anchor="middle" fill="${ink}" font-size="21" font-weight="750">${escapeXml(formatChartValue(point.value))}</text>`;
      }).join("\n") + labels;
    } else {
      const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
      const area = `${line} L ${points.at(-1)?.x || chartRight} ${chartBottom} L ${points[0]?.x || chartLeft} ${chartBottom} Z`;
      chart = grid;
      if (input.chartType === "area") {
        chart += `<path d="${area}" fill="${primary}" fill-opacity="0.16"/>`;
      }
      chart += `<path d="${line}" fill="none" stroke="${primary}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
      chart += points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="12" fill="${background}" stroke="${primary}" stroke-width="8"/>
<text x="${point.x}" y="${Math.max(chartTop + 24, point.y - 24)}" text-anchor="middle" fill="${ink}" font-size="21" font-weight="750">${escapeXml(formatChartValue(point.value))}</text>`).join("\n");
      chart += labels;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <rect x="64" y="56" width="12" height="90" rx="6" fill="${primary}"/>
  <text x="106" y="93" fill="${ink}" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" letter-spacing="2">CDS SPACE INSIGHT</text>
  <text x="106" y="145" fill="${ink}" font-family="Inter,Arial,sans-serif" font-size="45" font-weight="800">${title}</text>
  <text x="106" y="184" fill="${ink}" fill-opacity="0.64" font-family="Inter,Arial,sans-serif" font-size="23">${focus}</text>
  <g font-family="Inter,Arial,sans-serif">${chart}</g>
  <text x="${width - 86}" y="${height - 54}" text-anchor="end" fill="${ink}" fill-opacity="0.54" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700">cdsspace.pro</text>
</svg>`;
}

export function buildBlogVisualPrompt(input: {
  location: "cover" | "inline";
  articleTitle: string;
  brief: string;
  focus: string;
  visualType: Exclude<BlogVisualType, "chart">;
  visualText?: string;
  colors: string[];
}) {
  const typeInstruction: Record<Exclude<BlogVisualType, "chart">, string> = {
    image: "Create a premium editorial image. Use no written words, letters, logos, captions, or watermarks.",
    illustration: "Create a polished conceptual editorial illustration. Use no written words, letters, logos, captions, or watermarks.",
    image_text: `Create a premium editorial image and include exactly this short phrase once, spelled exactly: "${input.visualText || ""}". Do not add any other text or logo.`,
    infographic: `Create a clean editorial infographic with strong visual hierarchy. Only use this supplied copy: "${input.visualText || ""}". Do not invent statistics, labels, or a logo.`,
  };
  const placement = input.location === "cover"
    ? "This is a 16:9 Intelligence article cover. Keep important subjects and any requested text inside the central safe area so responsive cropping will not cut them off."
    : "This is an inline Intelligence visual. Make it readable at article width with one clear focal point and generous negative space.";

  return [
    "Create an original visual for a CDS Space thought-leadership article.",
    placement,
    `Article title: ${input.articleTitle || "Untitled article"}`,
    `Creative brief: ${input.brief}`,
    `Primary focus: ${input.focus}`,
    typeInstruction[input.visualType],
    `Use this exact colour palette as the dominant visual system: ${input.colors.join(", ")}.`,
    "Brand direction: premium, strategic, modern, credible, confident, editorial, and business-growth focused.",
    "Avoid generic stock-photo staging, clutter, mock logos, tiny illegible details, and decorative text.",
    "Deliver a complete final composition with no frame or presentation mockup around it.",
  ].join("\n");
}
