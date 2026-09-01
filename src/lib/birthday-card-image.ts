/**
 * Rasterises the birthday card. The download, the WhatsApp share and the email
 * all need the same PNG, so the conversion lives here rather than in the route
 * that happens to serve it first.
 */
import sharp from "sharp";
import { birthdayCardSvg, birthdayGender, type BirthdayGender } from "@/lib/birthday-artwork";

export { birthdayGender };
export type { BirthdayGender };

/** The card as PNG bytes, or null when this sharp build cannot rasterise SVG. */
export async function birthdayCardPng(gender: BirthdayGender, name: string): Promise<Buffer | null> {
  const svg = await birthdayCardSvg(gender, name);
  try {
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }
}
