import "server-only";

import crypto from "node:crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const TUTORIAL_BUCKET = "tutorial-private-assets";
// Kept below the deployment proxy's request ceiling so the multipart
// envelope also fits and the advertised limit is always usable.
export const TUTORIAL_VIDEO_MAX_BYTES = 150 * 1024 * 1024;

import { isTutorialTarget } from "@/lib/tutorial-targets";

/**
 * The tools, modules and pages a tutorial is filed under.
 *
 * One video often explains a job that spans several screens, so a tutorial
 * carries tags rather than a single tool. The first tag stays in tool_slug,
 * which keeps everything uploaded before tagging exactly where it was.
 */
export const TUTORIAL_MAX_TAGS = 12;

export function normalizeTutorialTags(value: unknown, fallback?: unknown): string[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      // A plain comma-separated list is accepted too, so a simple form post works.
      raw = value.split(",");
    }
  }
  const list = Array.isArray(raw) ? raw : [];
  const tags: string[] = [];
  for (const entry of list) {
    const slug = String(entry || "").trim();
    if (isTutorialTarget(slug) && !tags.includes(slug)) tags.push(slug);
    if (tags.length >= TUTORIAL_MAX_TAGS) break;
  }
  if (!tags.length) {
    const single = String(fallback || "").trim();
    if (isTutorialTarget(single)) tags.push(single);
  }
  if (!tags.length) {
    throw new UploadSecurityError("Choose at least one tool, module or page this tutorial addresses.", 400);
  }
  return tags;
}

export const TUTORIAL_TOOLS = [
  { slug: "official-letterhead", label: "Create letterhead" },
  { slug: "create-studio", label: "Create Studio" },
  { slug: "cdrive", label: "cDrive" },
  { slug: "chat", label: "Chat" },
  { slug: "cmeet", label: "cMeet" },
  { slug: "brand-brief", label: "Brand brief" },
  { slug: "brand-identity", label: "Brand identity" },
  { slug: "banners", label: "Banners" },
  { slug: "merch", label: "Merch" },
  { slug: "invoices", label: "Invoices" },
] as const;

export const TUTORIAL_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
] as const;

export type TutorialMedia = {
  id: string;
  languageCode: string;
  languageName: string;
  videoName: string;
  videoMime: string;
  videoSizeBytes: number;
  hasCaptions: boolean;
  videoUrl: string;
  audioUrl: string | null;
  captionsUrl: string | null;
  isOriginal: boolean;
};

export type TutorialRecord = {
  id: string;
  toolSlug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  completedAt: string | null;
  lastPositionSeconds: number;
  processingStatus: "queued" | "processing" | "ready" | "failed";
  /** The named step the upload is on, for the admin progress readout. */
  processingStage: "queued" | "scanning" | "preparing" | "transcribing" | "translating" | "ready" | "failed";
  /** Percentage through the current stage; only translation can count a total. */
  processingProgress: number;
  processingError: string | null;
  /** Stable id behind the shareable /tutorial/<token> link. */
  publicToken: string;
  sourceLanguageCode: string;
  /** Every tool, module or page this tutorial is filed under. */
  tags: string[];
  media: TutorialMedia[];
};

type TutorialRow = Record<string, unknown> & { media?: unknown };

function mapped(row: TutorialRow, admin = false): TutorialRecord {
  const progress = (row.progress && typeof row.progress === "object" ? row.progress : {}) as Record<string, unknown>;
  const mediaRows = Array.isArray(row.media) ? row.media as Record<string, unknown>[] : [];
  const sourceMedia = mediaRows.find((item) => Boolean(item.is_original)) || mediaRows.find((item) => Boolean(item.video_mime));
  return {
    id: String(row.id),
    toolSlug: String(row.tool_slug),
    tags: Array.isArray(row.tags) && row.tags.length
      ? (row.tags as unknown[]).map((tag) => String(tag))
      : [String(row.tool_slug)],
    title: String(row.title),
    description: String(row.description || ""),
    status: row.status === "draft" || row.status === "archived" ? row.status : "published",
    sortOrder: Number(row.sort_order || 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    openedAt: progress.opened_at ? String(progress.opened_at) : null,
    completedAt: progress.completed_at ? String(progress.completed_at) : null,
    lastPositionSeconds: Number(progress.last_position_seconds || 0),
    processingStatus: row.processing_status === "queued" || row.processing_status === "processing" || row.processing_status === "failed" ? row.processing_status : "ready",
    processingStage: ["queued", "scanning", "preparing", "transcribing", "translating", "failed"].includes(String(row.processing_stage))
      ? row.processing_stage as TutorialRecord["processingStage"]
      : "ready",
    processingProgress: Math.max(0, Math.min(100, Number(row.processing_progress || 0))),
    processingError: row.processing_error ? String(row.processing_error) : null,
    publicToken: String(row.public_token || ""),
    sourceLanguageCode: String(row.source_language_code || "en"),
    media: mediaRows.map((item) => {
      const id = String(item.id);
      const base = admin ? `/api/admin/tutorials/${row.id}/media/${id}` : `/api/client/tutorials/${row.id}/media/${id}`;
      return {
        id,
        languageCode: String(item.language_code),
        languageName: String(item.language_name),
        videoName: String(item.video_name || sourceMedia?.video_name || "tutorial-video"),
        videoMime: String(item.video_mime || sourceMedia?.video_mime || "video/mp4"),
        videoSizeBytes: Number(item.video_size_bytes || sourceMedia?.video_size_bytes || 0),
        hasCaptions: Boolean(item.captions_path),
        videoUrl: `${base}?kind=video`,
        audioUrl: item.audio_path ? `${base}?kind=audio` : null,
        captionsUrl: item.captions_path ? `${base}?kind=captions` : null,
        isOriginal: Boolean(item.is_original),
      };
    }),
  };
}

const MEDIA_JSON = `coalesce((select json_agg(json_build_object(
  'id', m.id, 'language_code', m.language_code, 'language_name', m.language_name,
  'video_name', m.video_name, 'video_mime', m.video_mime, 'video_size_bytes', m.video_size_bytes,
  'captions_path', m.captions_path, 'audio_path', m.audio_path, 'is_original', m.is_original
) order by case when m.is_original then 0 else 1 end, m.language_name)
from public.dashboard_tutorial_media m where m.tutorial_id = t.id), '[]'::json) as media`;

export async function listAdminTutorials() {
  const rows = await glashQuery<TutorialRow>(
    `select t.*, ${MEDIA_JSON} from public.dashboard_tutorials t
      where t.deleted_at is null order by t.sort_order, t.updated_at desc`,
  );
  return rows.map((row) => mapped(row, true));
}

export async function listClientTutorials(clientId: string, toolSlug?: string | null) {
  const rows = await glashQuery<TutorialRow>(
    `select t.*, ${MEDIA_JSON},
      case when p.client_user_id is null then null else json_build_object(
        'opened_at', p.opened_at, 'completed_at', p.completed_at,
        'last_position_seconds', p.last_position_seconds
      ) end as progress
      from public.dashboard_tutorials t
      left join public.client_tutorial_progress p on p.tutorial_id = t.id and p.client_user_id = $1::uuid
      where t.deleted_at is null and t.status = 'published' and t.processing_status = 'ready'
        and ($2::text is null or $2 = any(t.tags) or t.tool_slug = $2)
        and exists (select 1 from public.dashboard_tutorial_media available where available.tutorial_id = t.id)
      order by t.sort_order, t.updated_at desc`,
    [clientId, toolSlug || null],
  );
  return rows.map((row) => mapped(row));
}

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeLanguage(codeValue: unknown, nameValue: unknown) {
  const code = cleanText(codeValue, 12);
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(code)) throw new UploadSecurityError("Choose a valid tutorial language.", 400);
  const known = TUTORIAL_LANGUAGES.find((language) => language.code === code);
  if (!known) throw new UploadSecurityError("Choose one of the eight supported tutorial languages.", 400);
  const name = known.name;
  return { code, name };
}

async function safeTutorialVideo(file: File) {
  const safe = await assertSafeUpload(file, { allow: ["design"], maxBytes: TUTORIAL_VIDEO_MAX_BYTES });
  if (!safe.contentType.startsWith("video/") || !["mp4", "mov", "m4v", "webm"].includes(safe.ext)) {
    throw new UploadSecurityError("Upload an MP4, MOV, M4V, or WebM tutorial video.");
  }
  return safe;
}

export async function saveTutorial(input: {
  toolSlug?: unknown;
  tags?: unknown;
  title?: unknown;
  description?: unknown;
  status?: unknown;
  sortOrder?: unknown;
  languageCode: unknown;
  languageName: unknown;
  video: File;
  createdBy: string;
}) {
  const tags = normalizeTutorialTags(input.tags, input.toolSlug);
  const toolSlug = tags[0];
  const title = cleanText(input.title, 180);
  const description = cleanText(input.description, 1200);
  if (!title) throw new UploadSecurityError("Add a short tutorial title.", 400);
  const status = input.status === "draft" ? "draft" : "published";
  const sortOrder = Math.min(10000, Math.max(-10000, Number(input.sortOrder) || 0));
  const language = normalizeLanguage(input.languageCode, input.languageName);
  const video = await safeTutorialVideo(input.video);
  const tutorialId = crypto.randomUUID();
  const prefix = `tutorials/${tutorialId}/${language.code}`;
  const videoPath = `${prefix}/video-${crypto.randomUUID()}.${video.ext}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const storage = db.storage.from(TUTORIAL_BUCKET);
  const uploaded: string[] = [];
  try {
    await glashQuery(
      `insert into public.dashboard_tutorials
        (id, tool_slug, tags, title, description, status, sort_order, created_by, source_language_code, processing_status)
       values ($1::uuid, $2, $9::text[], $3, $4, $5, $6, $7, $8, 'queued')`,
      [tutorialId, toolSlug, title, description, status, sortOrder, input.createdBy, language.code, tags],
    );
    const videoUpload = await storage.upload(videoPath, video.buffer, { contentType: video.contentType, upsert: false });
    if (videoUpload.error) throw new Error(videoUpload.error.message);
    uploaded.push(videoPath);
    await glashQuery(
      `insert into public.dashboard_tutorial_media
        (tutorial_id, language_code, language_name, video_path, video_name, video_mime, video_size_bytes, is_original)
       values ($1::uuid,$2,$3,$4,$5,$6,$7,true)`,
      [tutorialId, language.code, language.name, videoPath, input.video.name.slice(0, 180), video.contentType, video.buffer.byteLength],
    );
    return tutorialId;
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded).catch(() => undefined);
    await glashQuery("delete from public.dashboard_tutorials where id=$1::uuid", [tutorialId]).catch(() => undefined);
    throw error;
  }
}

export async function updateTutorialMetadata(id: string, input: Record<string, unknown>) {
  const title = cleanText(input.title, 180);
  const tags = normalizeTutorialTags(input.tags, input.toolSlug);
  const toolSlug = tags[0];
  if (!title) throw new UploadSecurityError("Add a short tutorial title.", 400);
  const status = input.status === "draft" || input.status === "archived" ? input.status : "published";
  const rows = await glashQuery(
    `update public.dashboard_tutorials set title=$2, description=$3, tool_slug=$4, status=$5, sort_order=$6
      where id=$1::uuid and deleted_at is null returning id`,
    [id, title, cleanText(input.description, 1200), toolSlug, status, Math.min(10000, Math.max(-10000, Number(input.sortOrder) || 0))],
  );
  if (!rows.length) throw new UploadSecurityError("Tutorial not found.", 404);
}

export async function archiveTutorial(id: string) {
  await glashQuery("update public.dashboard_tutorials set status='archived', deleted_at=now() where id=$1::uuid", [id]);
}

export async function getTutorialAsset(input: { tutorialId: string; mediaId: string; kind: "video" | "audio" | "captions"; admin?: boolean }) {
  return glashMaybeOne<{ path: string; mime: string; name: string }>(
    `select case
        when $4 = 'captions' then m.captions_path
        when $4 = 'audio' then m.audio_path
        else coalesce(m.video_path, source.video_path)
      end as path,
      case
        when $4 = 'captions' then 'text/vtt; charset=utf-8'
        when $4 = 'audio' then m.audio_mime
        else coalesce(m.video_mime, source.video_mime)
      end as mime,
      case
        when $4 = 'captions' then m.captions_name
        when $4 = 'audio' then m.audio_name
        else coalesce(m.video_name, source.video_name)
      end as name
      from public.dashboard_tutorial_media m
      join public.dashboard_tutorials t on t.id=m.tutorial_id
      left join public.dashboard_tutorial_media source on source.tutorial_id=t.id and source.is_original
      where t.id=$1::uuid and m.id=$2::uuid and t.deleted_at is null
        and ($3::boolean or (t.status='published' and t.processing_status='ready'))`,
    [input.tutorialId, input.mediaId, Boolean(input.admin), input.kind],
  );
}

/**
 * The few public facts behind a shared tutorial link: enough to render the
 * page and its social preview card, and nothing that would let the video be
 * watched without signing in.
 */
export async function getPublicTutorialSummary(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  return glashMaybeOne<{ id: string; title: string; description: string; tool_slug: string; tags: string[] | null; public_token: string; updated_at: string }>(
    `select id, title, description, tool_slug, tags, public_token, updated_at
       from public.dashboard_tutorials
      where public_token = $1::uuid
        and deleted_at is null
        and status = 'published'
        and processing_status = 'ready'
      limit 1`,
    [token],
  );
}
