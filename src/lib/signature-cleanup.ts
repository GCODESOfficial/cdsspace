import "server-only";

import sharp from "sharp";

/**
 * Lifts a signature off the paper it was photographed on.
 *
 * Signatures arrive as photos or scans: white or grey paper, a shadow down
 * one side, sometimes a phone's colour cast. Dropped onto a letter as-is, the
 * paper shows as a pale box over the letterhead. This keeps the ink and makes
 * everything else transparent, so the signature sits on the page as if signed
 * there.
 *
 * The threshold is worked out per image rather than fixed: a faint pencil on
 * grey card and a black pen on white paper need different cuts, and a fixed
 * one would erase the first or keep the paper of the second.
 */
export type SignatureCleanupResult = {
  buffer: Buffer<ArrayBuffer>;
  width: number;
  height: number;
  /** Share of the image kept as ink, 0 to 1. Useful for spotting a bad cut. */
  inkRatio: number;
  /** True when the image already had transparency and was left as it is. */
  alreadyTransparent: boolean;
};

const MAX_DIMENSION = 2000;
/** Ink is never this pale; paper is never this dark. Guards against odd images. */
const MIN_THRESHOLD = 40;
const MAX_THRESHOLD = 245;

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Otsu's method: split the brightness histogram where paper and ink separate
 * most cleanly, rather than guessing a fixed grey level.
 */
function chooseThreshold(histogram: number[], total: number) {
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value];

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let best = { value: 128, variance: -1 };
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > best.variance) best = { value, variance };
  }
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, best.value));
}

export async function removeSignatureBackground(input: Buffer, options: { inkColour?: [number, number, number] } = {}): Promise<SignatureCleanupResult> {
  const prepared = sharp(input, { failOn: "none" })
    .rotate() // honour the phone's orientation before anything else
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });

  const { data, info } = await prepared.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;

  // An image that already carries transparency was drawn, not photographed:
  // a cSign drawing or a cut-out PNG. Leave it exactly as it is.
  let transparentPixels = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparentPixels += 1;
  if (transparentPixels > pixels * 0.05) {
    const untouched = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    return { buffer: Buffer.from(untouched) as Buffer<ArrayBuffer>, width: info.width, height: info.height, inkRatio: 0, alreadyTransparent: true };
  }

  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(luminance(data[i], data[i + 1], data[i + 2]))] += 1;
  }
  const threshold = chooseThreshold(histogram, pixels);
  // A soft edge either side of the cut, so strokes keep their smooth outline
  // instead of turning into jagged pixels.
  const feather = Math.max(12, Math.round(threshold * 0.18));
  const solidBelow = threshold - feather;

  const [inkR, inkG, inkB] = options.inkColour || [];
  let inkPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const light = luminance(data[i], data[i + 1], data[i + 2]);
    let alpha: number;
    if (light <= solidBelow) alpha = 255;
    else if (light >= threshold) alpha = 0;
    else alpha = Math.round(255 * (1 - (light - solidBelow) / (threshold - solidBelow)));

    if (alpha > 0) {
      inkPixels += 1;
      if (inkR !== undefined) {
        data[i] = inkR;
        data[i + 1] = inkG as number;
        data[i + 2] = inkB as number;
      } else {
        // Deepen what is left so a faint scan still reads as ink on the page.
        const darken = 0.82;
        data[i] = Math.round(data[i] * darken);
        data[i + 1] = Math.round(data[i + 1] * darken);
        data[i + 2] = Math.round(data[i + 2] * darken);
      }
    }
    data[i + 3] = alpha;
  }

  // Trim the empty paper around the signature so it can be placed precisely.
  const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .trim({ threshold: 0 })
    .toBuffer({ resolveWithObject: true })
    .then((result) => result)
    .catch(async () => ({
      data: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(),
      info: { width: info.width, height: info.height },
    }));

  return {
    buffer: Buffer.from(buffer.data) as Buffer<ArrayBuffer>,
    width: buffer.info.width,
    height: buffer.info.height,
    inkRatio: inkPixels / pixels,
    alreadyTransparent: false,
  };
}
