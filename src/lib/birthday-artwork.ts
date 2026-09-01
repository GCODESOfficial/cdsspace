/**
 * The designed birthday artwork, one vector per gender.
 *
 * The cards are hand-drawn SVGs in public/hbd, not generated, so the design
 * team can edit them without touching code. They are read from disk at request
 * time and cached in module memory. Anything that goes wrong falls back to the
 * generated card in birthday-card.ts, so a missing or unreadable file degrades
 * to a plain branded card rather than a broken image.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cdsLogoWhite } from "@/lib/cds-logo";
import { renderBirthdaySvg } from "@/lib/birthday-card";

export type BirthdayGender = "female" | "male";

export const BIRTHDAY_GENDERS: BirthdayGender[] = ["female", "male"];

/** Narrows any incoming value to a gender the artwork exists for. */
export function birthdayGender(value: unknown): BirthdayGender {
  return value === "male" ? "male" : "female";
}

// The artwork is 1451x1024 and the wordmark goes in whichever corner that
// design leaves clear: the female card's greeting runs into the bottom right,
// the male card has a confetti dot in the top right.
const ARTWORK_WIDTH = 1451;
const ARTWORK_HEIGHT = 1024;
const LOGO_WIDTH = 190;
const LOGO_MARGIN = 56;
const LOGO_CORNER: Record<BirthdayGender, "top" | "bottom"> = { female: "top", male: "bottom" };

const cache = new Map<BirthdayGender, string>();

async function loadArtwork(gender: BirthdayGender): Promise<string | null> {
  const cached = cache.get(gender);
  if (cached) return cached;
  try {
    const file = path.join(process.cwd(), "public", "hbd", `${gender}-hdb.svg`);
    const svg = await readFile(file, "utf8");
    if (!svg.includes("<svg")) return null;
    cache.set(gender, svg);
    return svg;
  } catch {
    return null;
  }
}

/** The artwork with the white CDS Space wordmark placed in a clear corner. */
function withLogo(svg: string, gender: BirthdayGender): string {
  const logoHeight = (LOGO_WIDTH / 153) * 71;
  const top = LOGO_CORNER[gender] === "top" ? 40 : ARTWORK_HEIGHT - LOGO_MARGIN - logoHeight;
  const logo = cdsLogoWhite(ARTWORK_WIDTH - LOGO_WIDTH - LOGO_MARGIN, top, LOGO_WIDTH);
  return svg.replace(/<\/svg>\s*$/, `${logo}</svg>`);
}

/**
 * The birthday card for one gender, as SVG. Falls back to the generated card
 * (which carries the recipient's name) when the artwork cannot be read.
 */
export async function birthdayCardSvg(gender: BirthdayGender, name: string): Promise<string> {
  const artwork = await loadArtwork(gender);
  return artwork ? withLogo(artwork, gender) : renderBirthdaySvg(name);
}
