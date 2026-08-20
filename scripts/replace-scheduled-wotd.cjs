#!/usr/bin/env node

/**
 * Replace a seven-day WOTD batch in place.
 *
 * Usage:
 *   node scripts/replace-scheduled-wotd.cjs [YYYY-MM-DD]
 *
 * The start date defaults to today in Africa/Lagos. Existing content IDs,
 * schedules, platforms and reminders are preserved; copy and SVG media are
 * replaced from branding_words.feature_date.
 */

const { randomUUID } = require("crypto");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: ".env.local" });
dotenv.config();

const BLUE = "#0050DB";
const AUTOMATION = "branding_word_of_the_day";

function dateKeyInLagos(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateAtOffset(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset, 12)).toISOString().slice(0, 10);
}

function slug(value) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "word";
}

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(value, maxChars, maxLines) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines = [];
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

function textBlock(lines, x, y, lineHeight, attrs = "") {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" ${attrs}>${escapeXml(line)}</text>`).join("\n");
}

function renderSvg(word) {
  const wordLines = wrapText(word.word, word.word.length > 18 ? 18 : 22, 2);
  const wordFontSize = word.word.length > 18 ? 76 : word.word.length > 12 ? 86 : 96;
  const wordStartY = 270;
  const wordLineHeight = wordFontSize + 12;
  const pronunciationY = wordStartY + wordLines.length * wordLineHeight - 34;
  const meaningStartY = pronunciationY + 130;
  const meaningLines = wrapText(word.meaning, 38, 5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="Branding Word of the Day ${escapeXml(word.word)}">
  <rect width="1080" height="1080" fill="${BLUE}"/>
  <g font-family="Inter, Arial, Helvetica, sans-serif">
    <text x="80" y="130" fill="rgba(255,255,255,0.74)" font-size="30" font-weight="800">BRANDING WORD OF THE DAY</text>
    ${textBlock(wordLines, 80, wordStartY, wordLineHeight, `fill="white" font-size="${wordFontSize}" font-weight="800"`)}
    <text x="80" y="${pronunciationY}" fill="rgba(255,255,255,0.66)" font-size="36" font-style="italic">${escapeXml(word.pronunciation)}</text>
    ${textBlock(meaningLines, 80, meaningStartY, 60, 'fill="white" font-size="44" font-weight="500"')}
    <text x="80" y="1000" fill="rgba(255,255,255,0.84)" font-size="32" font-weight="800">CDS Space</text>
    <text x="80" y="1040" fill="rgba(255,255,255,0.62)" font-size="26" font-weight="500">cdsspace.pro</text>
  </g>
</svg>`;
}

function scheduledCopy(word) {
  return {
    title: `Branding Word of the Day: ${word.word}`,
    body: [
      `Branding Word of the Day: ${word.word}`,
      word.pronunciation,
      "",
      word.meaning,
      word.example ? `Example: "${word.example}"` : "",
      "",
      "From CDS Space.",
    ].join("\n"),
  };
}

async function main() {
  const startDate = process.argv[2] || dateKeyInLagos();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("Start date must use YYYY-MM-DD.");

  const connectionString =
    process.env.GLASHDB_DIRECT_URL
    || process.env.DIRECT_URL
    || process.env.GLASHDB_DATABASE_URL
    || process.env.DATABASE_URL;
  const glashUrl = process.env.GLASHDB_URL || process.env.NEXT_PUBLIC_GLASHDB_URL;
  const serviceKey = process.env.GLASHDB_SERVICE_ROLE_KEY;
  if (!connectionString || !glashUrl || !serviceKey) throw new Error("Database and storage credentials are required.");

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const storage = createClient(glashUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from("media");
  const prepared = [];

  try {
    for (let offset = 0; offset < 7; offset += 1) {
      const dateKey = dateAtOffset(startDate, offset);
      const wordResult = await pool.query(
        `select id, word, pronunciation, part_of_speech, meaning, example
           from public.branding_words
          where feature_date = $1
          limit 1`,
        [dateKey],
      );
      const itemResult = await pool.query(
        `select *
           from public.content_items
          where status <> 'deleted'
            and ai_meta->>'automation' = $1
            and ai_meta->>'date_key' = $2
          order by created_at desc
          limit 1`,
        [AUTOMATION, dateKey],
      );
      const word = wordResult.rows[0];
      const item = itemResult.rows[0];
      if (!word) throw new Error(`No featured single term is configured for ${dateKey}.`);
      if (!item) throw new Error(`No scheduled WOTD post exists for ${dateKey}.`);
      if (/\s/.test(word.word) || !word.pronunciation) throw new Error(`Invalid WOTD term for ${dateKey}: ${word.word}`);

      const fileName = `cds-wotd-${dateKey}-${slug(word.word)}.svg`;
      const path = `content-hub/visual-library/wotd/${randomUUID()}.svg`;
      const svg = renderSvg(word);
      const uploaded = await storage.upload(path, Buffer.from(svg), {
        contentType: "image/svg+xml",
        upsert: false,
      });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const publicUrl = storage.getPublicUrl(path).data.publicUrl;
      prepared.push({
        dateKey,
        word,
        item,
        fileName,
        publicUrl,
        sizeBytes: Buffer.byteLength(svg),
      });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const row of prepared) {
        const copy = scheduledCopy(row.word);
        const aiMeta = {
          automation: AUTOMATION,
          date_key: row.dateKey,
          word_id: row.word.id,
          word: row.word.word.toLowerCase(),
          pronunciation: row.word.pronunciation,
          background: BLUE,
        };
        await client.query(
          `update public.content_items
              set title = $2,
                  body = $3,
                  ai_meta = coalesce(ai_meta, '{}'::jsonb) || $4::jsonb,
                  updated_at = now()
            where id = $1`,
          [row.item.id, copy.title, copy.body, JSON.stringify(aiMeta)],
        );

        const assetResult = await client.query(
          `select *
             from public.content_visual_assets
            where meta->>'automation' = $1 and meta->>'date_key' = $2
            order by created_at desc
            limit 1`,
          [AUTOMATION, row.dateKey],
        );
        let asset = assetResult.rows[0];
        const assetMeta = {
          automation: AUTOMATION,
          date_key: row.dateKey,
          word_id: row.word.id,
          word: row.word.word.toLowerCase(),
          background: BLUE,
          format: "1080x1080-svg",
        };
        if (asset) {
          asset = (await client.query(
            `update public.content_visual_assets
                set url = $2, kind = 'image', file_name = $3,
                    mime_type = 'image/svg+xml', size_bytes = $4,
                    title = $5, notes = $6, status = 'used',
                    used_at = now(), archived_at = null,
                    used_in_content_id = $7,
                    meta = coalesce(meta, '{}'::jsonb) || $8::jsonb,
                    updated_at = now()
              where id = $1
              returning *`,
            [
              asset.id,
              row.publicUrl,
              row.fileName,
              row.sizeBytes,
              `WOTD ${row.dateKey}: ${row.word.word}`,
              "Branding Word of the Day card with pronunciation.",
              row.item.id,
              JSON.stringify(assetMeta),
            ],
          )).rows[0];
        } else {
          asset = (await client.query(
            `insert into public.content_visual_assets
               (url, kind, file_name, mime_type, size_bytes, title, notes, tags,
                status, used_at, used_in_content_id, created_by, meta)
             values ($1,'image',$2,'image/svg+xml',$3,$4,$5,$6,'used',now(),$7,$8,$9::jsonb)
             returning *`,
            [
              row.publicUrl,
              row.fileName,
              row.sizeBytes,
              `WOTD ${row.dateKey}: ${row.word.word}`,
              "Branding Word of the Day card with pronunciation.",
              ["wotd", "branding-word-of-the-day", "auto-generated", "print"],
              row.item.id,
              "WOTD replacement",
              JSON.stringify(assetMeta),
            ],
          )).rows[0];
        }

        const media = (await client.query(
          `select id from public.content_media
            where content_id = $1
            order by position, created_at
            limit 1`,
          [row.item.id],
        )).rows[0];
        const mediaMeta = {
          visual_asset_id: asset.id,
          automation: AUTOMATION,
          date_key: row.dateKey,
          word_id: row.word.id,
        };
        if (media) {
          await client.query(
            `update public.content_media
                set url = $2, kind = 'image', file_name = $3,
                    mime_type = 'image/svg+xml', size_bytes = $4,
                    thumbnail_url = null,
                    meta = coalesce(meta, '{}'::jsonb) || $5::jsonb
              where id = $1`,
            [media.id, row.publicUrl, row.fileName, row.sizeBytes, JSON.stringify(mediaMeta)],
          );
        } else {
          await client.query(
            `insert into public.content_media
               (content_id, url, kind, file_name, mime_type, size_bytes, position, meta)
             values ($1,$2,'image',$3,'image/svg+xml',$4,0,$5::jsonb)`,
            [row.item.id, row.publicUrl, row.fileName, row.sizeBytes, JSON.stringify(mediaMeta)],
          );
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    console.log(JSON.stringify(
      prepared.map((row) => ({
        date_key: row.dateKey,
        content_id: row.item.id,
        word: row.word.word,
        pronunciation: row.word.pronunciation,
      })),
      null,
      2,
    ));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
