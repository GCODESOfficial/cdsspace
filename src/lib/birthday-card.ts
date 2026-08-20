// Branded birthday-card generator, in the spirit of the Word-of-the-Day image.
// renderBirthdaySvg() returns a 1080x1080 SVG string; the API route rasterizes
// it to PNG (via sharp) so it can be shared on WhatsApp / socials directly.

const CDS_BLUE = "#0A4FE8";
const CDS_DEEP = "#0035C1";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word-wrap to at most `maxLines` lines of ~`maxChars` characters. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length ? lines : [""];
}

function firstName(name: string): string {
  return String(name || "").trim().split(/\s+/)[0] || "Friend";
}

export function defaultBirthdayMessage(name: string): string {
  const first = firstName(name);
  return `Happy Birthday, ${first}! 🎉\n\nEveryone at CDS Space is wishing you a day as bright and creative as the work we build together. Thank you for being part of our story - here's to another remarkable year ahead.\n\nWith love,\nThe CDS Space Team`;
}

export function renderBirthdaySvg(name: string): string {
  const display = String(name || "").trim() || "Friend";
  const nameLines = wrapText(display, display.length > 16 ? 16 : 20, 2);
  const nameFont = display.length > 16 ? 96 : display.length > 10 ? 116 : 132;
  const nameStartY = 560;
  const lineHeight = nameFont + 14;
  const nameBlock = nameLines
    .map((line, index) => `<text x="540" y="${nameStartY + index * lineHeight}" text-anchor="middle" fill="white" font-size="${nameFont}" font-weight="800">${escapeXml(line)}</text>`)
    .join("\n    ");

  // Confetti - deterministic positions so the image is stable across renders.
  const confetti = [
    [120, 180, "#FFD166"], [960, 120, "#EF476F"], [220, 90, "#06D6A0"], [860, 260, "#FFD166"],
    [80, 520, "#EF476F"], [1000, 620, "#06D6A0"], [160, 900, "#FFD166"], [940, 900, "#EF476F"],
    [520, 90, "#FFFFFF"], [700, 160, "#06D6A0"], [360, 200, "#FFD166"],
  ].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="12" fill="${c}" opacity="0.9"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="Happy Birthday ${escapeXml(display)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${CDS_DEEP}"/>
      <stop offset="1" stop-color="${CDS_BLUE}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  ${confetti}
  <g font-family="Inter, Arial, Helvetica, sans-serif" text-anchor="middle">
    <text x="540" y="380" fill="rgba(255,255,255,0.82)" font-size="40" font-weight="800" letter-spacing="6">HAPPY BIRTHDAY</text>
    ${nameBlock}
    <text x="540" y="820" fill="rgba(255,255,255,0.9)" font-size="34" font-weight="500">Wishing you a wonderful year ahead</text>
    <text x="540" y="990" fill="rgba(255,255,255,0.9)" font-size="34" font-weight="800">CDS Space</text>
    <text x="540" y="1030" fill="rgba(255,255,255,0.6)" font-size="26" font-weight="500">cdsspace.pro</text>
  </g>
</svg>`;
}

/** The next calendar occurrence of a birthday, ignoring the stored birth year. */
export function nextBirthdayOccurrence(birthday: string | null, today = new Date()): Date | null {
  if (!birthday) return null;
  const parts = birthday.slice(0, 10).split("-").map(Number);
  if (parts.length < 3 || Number.isNaN(parts[1]) || Number.isNaN(parts[2])) return null;
  const [, month, day] = parts;
  const year = today.getFullYear();
  const todayMidnight = new Date(year, today.getMonth(), today.getDate());
  let next = new Date(year, month - 1, day);
  if (next < todayMidnight) next = new Date(year + 1, month - 1, day);
  return next;
}

/** Year of the birthday occurrence the current reminder is referring to. */
export function nextBirthdayYear(birthday: string | null, today = new Date()): number | null {
  return nextBirthdayOccurrence(birthday, today)?.getFullYear() ?? null;
}

/** True when the team has already recorded wishes for the upcoming occurrence. */
export function birthdayWishedForNextOccurrence(
  birthday: string | null,
  wishedForYear: number | null | undefined,
  today = new Date(),
): boolean {
  const occurrenceYear = nextBirthdayYear(birthday, today);
  return occurrenceYear !== null && wishedForYear === occurrenceYear;
}

/**
 * Days until the client's next birthday (0 = today), computed on month/day so
 * it works regardless of the stored year. Returns null if no birthday.
 */
export function daysUntilBirthday(birthday: string | null, today = new Date()): number | null {
  const next = nextBirthdayOccurrence(birthday, today);
  if (!next) return null;
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
}
