/* eslint-disable @typescript-eslint/no-explicit-any */
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { uploadContentHubFile } from "@/lib/content-hub/upload";
import { REMINDER_OFFSETS } from "@/lib/content-hub/shared";
import {
  BRANDING_WOTD_BLUE,
  brandingWordDayNumber,
  getBrandingWordDateKey,
  normalizeBrandingWord,
  pickBrandingWordForDate,
  type BrandingWordLike,
} from "@/lib/branding-word-of-day";

type Actor = {
  name: string;
  id?: string | null;
};

interface ContentSettingsRow {
  reminder_offsets: string[] | null;
  reminder_channels: string[] | null;
  default_publisher_id: string | null;
  default_publisher_name: string | null;
}

interface WotdPrintResult {
  created: boolean;
  replaced: boolean;
  date_key: string;
  word: BrandingWordLike;
  item: Record<string, any> | null;
  visual_asset: Record<string, any> | null;
}

interface WotdPrintOptions {
  replaceExisting?: boolean;
}

const AUTOMATION_KEY = "branding_word_of_the_day";
const DEFAULT_PLATFORMS = ["instagram", "facebook", "linkedin"];
const DEFAULT_TAGS = ["wotd", "branding-word-of-the-day", "auto-generated", "print"];

/**
 * Read the current dashboard word without generating artwork, uploading files,
 * or creating scheduled content. This keeps the client dashboard's first paint
 * independent from the slower publishing automation.
 */
export async function getWotdWordFast(date = new Date()) {
  const dateKey = getBrandingWordDateKey(date);
  let existing: BrandingWordLike | null = null;

  try {
    existing = await glashMaybeOne<BrandingWordLike>(
      `select word.id, word.word, word.pronunciation, word.part_of_speech,
              word.meaning, word.example, word.feature_date::text,
              word.editorial_rank, word.created_at::text
         from public.content_items item
         join public.branding_words word
           on word.id::text = item.ai_meta->>'word_id'
        where item.ai_meta->>'automation' = $1
          and item.ai_meta->>'date_key' = $2
        order by item.created_at desc
        limit 1`,
      [AUTOMATION_KEY, dateKey],
    );
  } catch {
    // Content Hub may still be deploying. The word bank below is sufficient
    // for the dashboard while publishing catches up independently.
  }

  if (existing) return { date_key: dateKey, word: existing };

  // Use the same used-word history and queue as Content Hub generation. The
  // dashboard therefore previews the exact word the admin automation will use,
  // instead of repeatedly falling back to the first word in the library.
  // When days have gone by without a recorded word (nothing generated the
  // print), step one word along the queue for each of them: otherwise every
  // such day showed the same next word.
  const rows = await loadBrandingWords();
  const latest = await glashMaybeOne<{ day: string | null }>(
    `select max(ai_meta->>'date_key') as day from public.content_items where ai_meta->>'automation' = $1`,
    [AUTOMATION_KEY],
  ).catch(() => null);
  const skip = latest?.day && latest.day < dateKey
    ? Math.max(0, brandingWordDayNumber(dateKey) - brandingWordDayNumber(latest.day) - 1)
    : 0;
  const nextWord = await loadNextBrandingWord(dateKey, rows, skip);
  return { date_key: dateKey, word: nextWord };
}

function strArr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "word";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value: string, maxChars: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:\s]+$/, "")}...`;
  }
  return lines;
}

function textBlock(lines: string[], x: number, y: number, lineHeight: number, attrs = "") {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" ${attrs}>${escapeXml(line)}</text>`)
    .join("\n");
}

function makeServerFile(content: string, fileName: string, type: string): File {
  if (typeof File !== "undefined") {
    return new File([content], fileName, { type });
  }
  const blob = new Blob([content], { type }) as File;
  Object.defineProperty(blob, "name", { value: fileName });
  Object.defineProperty(blob, "lastModified", { value: Date.now() });
  return blob;
}

function lagosScheduleIso(dateKey: string, hour = 9, minute = 0) {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day, hour - 1, minute, 0, 0)).toISOString();
}

function buildReminders(contentId: string, scheduledAtIso: string, offsets: string[], channels: string[]) {
  const scheduled = new Date(scheduledAtIso).getTime();
  const now = Date.now();
  const rows: { content_id: string; offset_label: string; fire_at: string; channels: string[] }[] = [];

  for (const offset of offsets) {
    const def = REMINDER_OFFSETS.find((item) => item.value === offset);
    if (!def) continue;
    const fire = scheduled - def.minutesBefore * 60_000;
    if (fire <= now) continue;
    rows.push({
      content_id: contentId,
      offset_label: offset,
      fire_at: new Date(fire).toISOString(),
      channels: channels.length ? channels : ["dashboard"],
    });
  }

  return rows;
}

function renderWotdSvg(word: BrandingWordLike) {
  const wordLines = wrapText(word.word, word.word.length > 18 ? 18 : 22, 2);
  const wordFontSize = word.word.length > 18 ? 76 : word.word.length > 12 ? 86 : 96;
  const wordStartY = 270;
  const wordLineHeight = wordFontSize + 12;
  const pronunciationY = wordStartY + wordLines.length * wordLineHeight - 34;
  const meaningStartY = pronunciationY + (word.pronunciation ? 130 : 100);
  const meaningLines = wrapText(word.meaning, 38, 5);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="Branding Word of the Day ${escapeXml(word.word)}">
  <rect width="1080" height="1080" fill="${BRANDING_WOTD_BLUE}"/>
  <g font-family="Inter, Arial, Helvetica, sans-serif">
    <text x="80" y="130" fill="rgba(255,255,255,0.74)" font-size="30" font-weight="800" letter-spacing="0">BRANDING WORD OF THE DAY</text>
    ${textBlock(wordLines, 80, wordStartY, wordLineHeight, `fill="white" font-size="${wordFontSize}" font-weight="800"`)}
    ${word.pronunciation ? `<text x="80" y="${pronunciationY}" fill="rgba(255,255,255,0.66)" font-size="36" font-style="italic">${escapeXml(word.pronunciation)}</text>` : ""}
    ${textBlock(meaningLines, 80, meaningStartY, 60, `fill="white" font-size="44" font-weight="500"`)}
    <text x="80" y="1000" fill="rgba(255,255,255,0.84)" font-size="32" font-weight="800">CDS Space</text>
    <text x="80" y="1040" fill="rgba(255,255,255,0.62)" font-size="26" font-weight="500">cdsspace.pro</text>
  </g>
</svg>`;
}

async function loadBrandingWords() {
  let rows: BrandingWordLike[];
  try {
    rows = await glashQuery<any>(
      `select id, word, pronunciation, part_of_speech, meaning, example,
              feature_date::text, editorial_rank, created_at::text
       from public.branding_words
       order by editorial_rank asc nulls last, created_at asc, word asc, id asc`,
    ) as BrandingWordLike[];
  } catch {
    rows = await glashQuery<any>(
      `select id, word, pronunciation, part_of_speech, meaning, example,
              null::text as feature_date, null::integer as editorial_rank, created_at::text
       from public.branding_words
      order by created_at asc, word asc, id asc`,
    ) as BrandingWordLike[];
  }
  return rows;
}

async function loadUsedBrandingWords() {
  return glashQuery<{ word_id: string | null; word: string | null }>(
    `select distinct
            nullif(ai_meta->>'word_id', '') as word_id,
            nullif(ai_meta->>'word', '') as word
       from public.content_items
      where ai_meta->>'automation' = $1`,
    [AUTOMATION_KEY],
  );
}

async function loadNextBrandingWord(dateKey: string, rows: BrandingWordLike[], skip = 0) {
  const used = await loadUsedBrandingWords();
  const excludedWordIds = new Set(used.map((item) => item.word_id).filter((id): id is string => Boolean(id)));
  const excludedWords = new Set(used.map((item) => normalizeBrandingWord(item.word)).filter(Boolean));

  // Older WOTD records only stored word_id. Resolve those IDs back to their
  // normalized text so duplicate database rows cannot reintroduce the same word.
  for (const row of rows) {
    if (excludedWordIds.has(String(row.id))) {
      excludedWords.add(normalizeBrandingWord(row.word));
    }
  }

  const word = pickBrandingWordForDate(rows, dateKey, { excludedWordIds, excludedWords, skip });
  if (!word) {
    throw new Error("All branding words have already been used. Add more words before creating another WOTD print.");
  }
  return word;
}

function findBrandingWordById(rows: BrandingWordLike[], value: unknown) {
  const id = String(value || "").trim();
  return id ? rows.find((word) => String(word.id) === id) || null : null;
}

async function loadSettings() {
  return glashMaybeOne<any>(
    `select s.reminder_offsets,
            s.reminder_channels,
            s.default_publisher_id::text,
            tm.full_name as default_publisher_name
       from public.content_settings s
       left join public.team_members tm on tm.id = s.default_publisher_id
      where s.id = 1`,
  ) as Promise<ContentSettingsRow | null>;
}

async function findExistingContent(dateKey: string) {
  return glashMaybeOne<any>(
    `select * from public.content_items
      where status <> 'deleted'
        and ai_meta->>'automation' = $1
        and ai_meta->>'date_key' = $2
      order by created_at desc
      limit 1`,
    [AUTOMATION_KEY, dateKey],
  );
}

async function findExistingAsset(dateKey: string) {
  return glashMaybeOne<any>(
    `select * from public.content_visual_assets
      where meta->>'automation' = $1
        and meta->>'date_key' = $2
      order by created_at desc
      limit 1`,
    [AUTOMATION_KEY, dateKey],
  );
}

async function createVisualAsset(word: BrandingWordLike, dateKey: string, actor: Actor) {
  const fileName = `cds-wotd-${dateKey}-${slug(word.word)}.svg`;
  const svg = renderWotdSvg(word);
  const file = makeServerFile(svg, fileName, "image/svg+xml");
  const uploaded = await uploadContentHubFile(file, "content-hub/visual-library/wotd");
  const title = `WOTD ${dateKey}: ${word.word}`;

  const [asset] = await glashQuery<any>(
    `insert into public.content_visual_assets
       (url, kind, file_name, mime_type, size_bytes, title, notes, tags, status, created_by, created_by_id, meta)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning *`,
    [
      uploaded.url,
      "image",
      uploaded.file_name,
      uploaded.mime_type,
      uploaded.size_bytes,
      title,
      "Auto-generated Branding Word of the Day card.",
      DEFAULT_TAGS,
      "available",
      actor.name,
      actor.id || null,
      {
        automation: AUTOMATION_KEY,
        date_key: dateKey,
        word_id: word.id,
        word: normalizeBrandingWord(word.word),
        background: BRANDING_WOTD_BLUE,
        format: "1080x1080-svg",
      },
    ],
  );

  return asset;
}

async function replaceVisualAsset(
  existingAsset: Record<string, any> | null,
  word: BrandingWordLike,
  dateKey: string,
  actor: Actor,
) {
  if (!existingAsset) return createVisualAsset(word, dateKey, actor);

  const fileName = `cds-wotd-${dateKey}-${slug(word.word)}.svg`;
  const svg = renderWotdSvg(word);
  const file = makeServerFile(svg, fileName, "image/svg+xml");
  const uploaded = await uploadContentHubFile(file, "content-hub/visual-library/wotd");
  const [asset] = await glashQuery<any>(
    `update public.content_visual_assets
        set url = $2,
            kind = 'image',
            file_name = $3,
            mime_type = $4,
            size_bytes = $5,
            title = $6,
            notes = $7,
            tags = $8,
            status = 'used',
            archived_at = null,
            created_by = $9,
            created_by_id = $10,
            meta = coalesce(meta, '{}'::jsonb) || $11::jsonb,
            updated_at = now()
      where id = $1
      returning *`,
    [
      existingAsset.id,
      uploaded.url,
      uploaded.file_name,
      uploaded.mime_type,
      uploaded.size_bytes,
      `WOTD ${dateKey}: ${word.word}`,
      "Branding Word of the Day card with pronunciation.",
      DEFAULT_TAGS,
      actor.name,
      actor.id || null,
      JSON.stringify({
        automation: AUTOMATION_KEY,
        date_key: dateKey,
        word_id: word.id,
        word: normalizeBrandingWord(word.word),
        background: BRANDING_WOTD_BLUE,
        format: "1080x1080-svg",
      }),
    ],
  );
  return asset;
}

function scheduledCopy(word: BrandingWordLike) {
  return {
    title: `Branding Word of the Day: ${word.word}`,
    body: [
      `Branding Word of the Day: ${word.word}`,
      word.pronunciation || "",
      "",
      word.meaning,
      word.example ? `Example: "${word.example}"` : "",
      "",
      "From CDS Space.",
    ].filter((line, index, arr) => line || arr[index - 1]).join("\n"),
  };
}

async function createScheduledContent(
  word: BrandingWordLike,
  asset: Record<string, any>,
  dateKey: string,
  actor: Actor,
  settings: ContentSettingsRow | null,
) {
  const scheduledAt = lagosScheduleIso(dateKey);
  const { title, body } = scheduledCopy(word);

  const [item] = await glashQuery<any>(
    `insert into public.content_items
       (title, body, source, category, content_type, platforms, cta_label, cta_url, cta_type,
        hashtags, status, scheduled_at, scheduled_platform, assigned_publisher_id, assigned_publisher_name,
        campaign, series, tags, ai_meta, created_by, created_by_id, approved_by, approved_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     returning *`,
    [
      title,
      body,
      "ai",
      "Education",
      "Marketing",
      DEFAULT_PLATFORMS,
      "Visit CDS Space",
      "https://cdsspace.pro",
      "custom",
      ["#Branding", "#BrandStrategy", "#WordOfTheDay", "#CDSSpace"],
      "scheduled",
      scheduledAt,
      "instagram",
      settings?.default_publisher_id || null,
      settings?.default_publisher_name || null,
      "Branding Word of the Day",
      "WOTD",
      DEFAULT_TAGS,
      {
        automation: AUTOMATION_KEY,
        date_key: dateKey,
        word_id: word.id,
        word: normalizeBrandingWord(word.word),
        background: BRANDING_WOTD_BLUE,
      },
      actor.name,
      actor.id || null,
      actor.name,
      new Date().toISOString(),
    ],
  );

  await glashQuery(
    `insert into public.content_media
       (content_id, url, kind, file_name, mime_type, size_bytes, thumbnail_url, position, meta)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      item.id,
      asset.url,
      "image",
      asset.file_name || null,
      asset.mime_type || "image/svg+xml",
      asset.size_bytes || null,
      null,
      0,
      { visual_asset_id: asset.id, automation: AUTOMATION_KEY, date_key: dateKey },
    ],
  );

  await glashQuery(
    `update public.content_visual_assets
        set status = 'used',
            used_at = now(),
            archived_at = null,
            used_in_content_id = $1,
            updated_at = now()
      where id = $2`,
    [item.id, asset.id],
  );

  const reminders = buildReminders(
    String(item.id),
    scheduledAt,
    strArr(settings?.reminder_offsets).length ? strArr(settings?.reminder_offsets) : ["24h", "1h", "15m", "due"],
    strArr(settings?.reminder_channels).length ? strArr(settings?.reminder_channels) : ["dashboard", "email"],
  );
  for (const reminder of reminders) {
    await glashQuery(
      `insert into public.content_reminders (content_id, offset_label, fire_at, channels)
       values ($1,$2,$3,$4)`,
      [reminder.content_id, reminder.offset_label, reminder.fire_at, reminder.channels],
    );
  }

  return item;
}

async function replaceScheduledContent(
  existingItem: Record<string, any>,
  word: BrandingWordLike,
  asset: Record<string, any>,
  dateKey: string,
) {
  const { title, body } = scheduledCopy(word);
  const [item] = await glashQuery<any>(
    `update public.content_items
        set title = $2,
            body = $3,
            ai_meta = coalesce(ai_meta, '{}'::jsonb) || $4::jsonb,
            updated_at = now()
      where id = $1
      returning *`,
    [
      existingItem.id,
      title,
      body,
      JSON.stringify({
        automation: AUTOMATION_KEY,
        date_key: dateKey,
        word_id: word.id,
        word: normalizeBrandingWord(word.word),
        pronunciation: word.pronunciation,
        background: BRANDING_WOTD_BLUE,
      }),
    ],
  );

  const media = await glashMaybeOne<{ id: string }>(
    `select id
       from public.content_media
      where content_id = $1
      order by position, created_at
      limit 1`,
    [existingItem.id],
  );
  if (media) {
    await glashQuery(
      `update public.content_media
          set url = $2,
              kind = 'image',
              file_name = $3,
              mime_type = $4,
              size_bytes = $5,
              thumbnail_url = null,
              meta = coalesce(meta, '{}'::jsonb) || $6::jsonb
        where id = $1`,
      [
        media.id,
        asset.url,
        asset.file_name || null,
        asset.mime_type || "image/svg+xml",
        asset.size_bytes || null,
        JSON.stringify({
          visual_asset_id: asset.id,
          automation: AUTOMATION_KEY,
          date_key: dateKey,
          word_id: word.id,
        }),
      ],
    );
  } else {
    await glashQuery(
      `insert into public.content_media
         (content_id, url, kind, file_name, mime_type, size_bytes, position, meta)
       values ($1,$2,'image',$3,$4,$5,0,$6::jsonb)`,
      [
        existingItem.id,
        asset.url,
        asset.file_name || null,
        asset.mime_type || "image/svg+xml",
        asset.size_bytes || null,
        JSON.stringify({
          visual_asset_id: asset.id,
          automation: AUTOMATION_KEY,
          date_key: dateKey,
          word_id: word.id,
        }),
      ],
    );
  }
  await glashQuery(
    `update public.content_visual_assets
        set status = 'used',
            used_at = now(),
            archived_at = null,
            used_in_content_id = $1,
            updated_at = now()
      where id = $2`,
    [existingItem.id, asset.id],
  );
  return item;
}

export async function ensureWotdPrint(
  actor: Actor = { name: "WOTD print" },
  date = new Date(),
  options: WotdPrintOptions = {},
): Promise<WotdPrintResult> {
  const dateKey = getBrandingWordDateKey(date);
  const [rows, existingItem, existingAsset] = await Promise.all([
    loadBrandingWords(),
    findExistingContent(dateKey),
    findExistingAsset(dateKey),
  ]);

  if (existingItem && !options.replaceExisting) {
    const word = findBrandingWordById(rows, existingItem.ai_meta?.word_id)
      || await loadNextBrandingWord(dateKey, rows);
    return {
      created: false,
      replaced: false,
      date_key: dateKey,
      word,
      item: existingItem,
      visual_asset: existingAsset,
    };
  }

  if (existingItem && options.replaceExisting) {
    const word = await loadNextBrandingWord(dateKey, rows);
    const asset = await replaceVisualAsset(existingAsset, word, dateKey, actor);
    const item = await replaceScheduledContent(existingItem, word, asset, dateKey);
    return {
      created: false,
      replaced: true,
      date_key: dateKey,
      word,
      item,
      visual_asset: asset,
    };
  }

  // If asset upload succeeded but content creation failed on an earlier attempt,
  // keep the word pinned to that asset instead of pairing the image with a new word.
  const word = findBrandingWordById(rows, existingAsset?.meta?.word_id)
    || await loadNextBrandingWord(dateKey, rows);
  const settings = await loadSettings();
  const asset = existingAsset || await createVisualAsset(word, dateKey, actor);
  const item = await createScheduledContent(word, asset, dateKey, actor, settings);

  return {
    created: true,
    replaced: false,
    date_key: dateKey,
    word,
    item,
    visual_asset: asset,
  };
}
