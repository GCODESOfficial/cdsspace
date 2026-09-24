import "server-only";

import QRCode from "qrcode";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getReadyEngineChain, processQueuedJob } from "./engines";
import {
  CREATE_STORAGE_LIMIT_BYTES,
  DEFAULT_CREATE_TOOLS,
  type CreateAdvertBanner,
  type CreateCreditAccount,
  type CreateCreation,
  type CreateDashboardData,
  type CreateProject,
  type CreateRole,
  type CreateTemplate,
  type CreateTool,
} from "@/lib/create-platform/catalog";
import type { CreateActor } from "@/lib/create-platform/session";
import { runLiveBrandNameCheck } from "@/lib/create-platform/brand-name-checker";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError, releaseClientStorageReservation, reserveClientStorage } from "@/lib/client-storage";

type DbTool = {
  id?: string;
  slug: string;
  name: string;
  short_description: string;
  category: string;
  stage: "phase_1" | "phase_2" | "phase_3";
  status: "active" | "maintenance" | "disabled";
  role_access: CreateRole[];
  credit_cost: number;
  requires_provider: boolean;
  provider_key: string | null;
  is_beta: boolean;
  is_new: boolean;
  is_featured: boolean;
  supports_simple_mode: boolean;
  supports_pro_mode: boolean;
  output_formats: string[];
  admin_notes?: string | null;
};

function advertBannerFromDb(row: Record<string, unknown> | null): CreateAdvertBanner | null {
  if (!row) return null;
  return {
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
    altText: String(row.alt_text || "CDS Space Create promotion"),
    targetUrl: typeof row.target_url === "string" ? row.target_url : null,
    isActive: Boolean(row.is_active),
    width:
      row.image_width != null && Number.isFinite(Number(row.image_width))
        ? Number(row.image_width)
        : null,
    height:
      row.image_height != null && Number.isFinite(Number(row.image_height))
        ? Number(row.image_height)
        : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function loadCreateAdvertBanner(): Promise<CreateAdvertBanner | null> {
  try {
    const row = await glashMaybeOne<Record<string, unknown>>(
      `select image_url, alt_text, target_url, is_active, image_width, image_height, updated_at
         from public.create_advert_banner
        where id = 1`,
    );
    return advertBannerFromDb(row);
  } catch {
    return null;
  }
}

function safeAdvertTarget(value: unknown) {
  const target = cleanText(value, 1200);
  if (!target) return null;
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function upsertCreateAdvertBanner(input: {
  imageUrl?: unknown; storagePath?: unknown; altText?: unknown; targetUrl?: unknown;
  isActive?: unknown; width?: unknown; height?: unknown; updatedBy?: unknown;
}) {
  const imageUrl = cleanText(input.imageUrl, 2000) || null;
  const storagePath = cleanText(input.storagePath, 1000) || null;
  const row = await glashMaybeOne<Record<string, unknown>>(
    `insert into public.create_advert_banner
      (id, image_url, storage_path, alt_text, target_url, is_active, image_width, image_height, updated_by, updated_at)
     values (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (id) do update set
       image_url = coalesce(excluded.image_url, public.create_advert_banner.image_url),
       storage_path = coalesce(excluded.storage_path, public.create_advert_banner.storage_path),
       alt_text = excluded.alt_text,
       target_url = excluded.target_url,
       is_active = excluded.is_active,
       image_width = coalesce(excluded.image_width, public.create_advert_banner.image_width),
       image_height = coalesce(excluded.image_height, public.create_advert_banner.image_height),
       updated_by = excluded.updated_by,
       updated_at = now()
     returning image_url, alt_text, target_url, is_active, image_width, image_height, updated_at`,
    [
      imageUrl,
      storagePath,
      cleanText(input.altText, 180) || "CDS Space Create promotion",
      safeAdvertTarget(input.targetUrl),
      input.isActive === true,
      Number.isFinite(Number(input.width)) ? Math.max(1, Number(input.width)) : null,
      Number.isFinite(Number(input.height)) ? Math.max(1, Number(input.height)) : null,
      cleanText(input.updatedBy, 320) || null,
    ],
  );
  if (!row) throw new Error("Could not save the Create advert banner.");
  return advertBannerFromDb(row);
}

function toolFromDb(row: DbTool): CreateTool {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    category: row.category,
    stage: row.stage,
    status: row.status,
    roleAccess: row.role_access || ["client", "team", "admin"],
    creditCost: Number(row.credit_cost || 0),
    requiresProvider: Boolean(row.requires_provider),
    providerKey: row.provider_key,
    isBeta: Boolean(row.is_beta),
    isNew: Boolean(row.is_new),
    isFeatured: Boolean(row.is_featured),
    supportsSimpleMode: Boolean(row.supports_simple_mode),
    supportsProMode: Boolean(row.supports_pro_mode),
    outputFormats: row.output_formats || [],
    adminNotes: row.admin_notes ?? null,
  };
}

function projectFromDb(row: Record<string, unknown>): CreateProject {
  return {
    id: String(row.id),
    name: String(row.name || "Untitled project"),
    description: typeof row.description === "string" ? row.description : null,
    color: typeof row.color === "string" ? row.color : "#0A4FE8",
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

function templateFromDb(row: Record<string, unknown>): CreateTemplate {
  return {
    id: String(row.id),
    name: String(row.name || "Untitled template"),
    category: String(row.category || "General"),
    description: String(row.description || ""),
    scope: (row.scope as CreateTemplate["scope"]) || "global",
    status: (row.status as CreateTemplate["status"]) || "published",
    previewUrl: typeof row.preview_url === "string" ? row.preview_url : null,
    lockedFields: Array.isArray(row.locked_fields) ? row.locked_fields.map(String) : [],
    editableFields: Array.isArray(row.editable_fields) ? row.editable_fields.map(String) : [],
  };
}

function creationFromDb(row: Record<string, unknown>): CreateCreation {
  return {
    id: String(row.id),
    toolSlug: String(row.tool_slug || ""),
    toolName: String(row.tool_name || "CREATE tool"),
    title: String(row.title || "Untitled creation"),
    status: (row.status as CreateCreation["status"]) || "ready",
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    inputSummary: asRecord(row.input_summary),
    output: asRecord(row.output),
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    fileSizeBytes: Number.isFinite(Number(row.file_size_bytes)) ? Number(row.file_size_bytes) : null,
    outputFormat: typeof row.output_format === "string" ? row.output_format : null,
    isFavorite: Boolean(row.is_favorite),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actorParams(actor: Pick<CreateActor, "kind" | "id">) {
  return [actor.kind, actor.id];
}

function defaultCredits(role: CreateRole) {
  if (role === "admin") return 100000;
  if (role === "team") return 200;
  return 50;
}

function providerReady(tool: CreateTool) {
  return !tool.requiresProvider || Boolean(tool.providerKey && process.env[tool.providerKey]);
}

async function ownedProjectId(actor: CreateActor, value: unknown) {
  const candidate = typeof value === "string" && validUuid(value) ? value : "";
  if (!candidate) return null;
  const project = await glashMaybeOne<{ id: string }>(
    `select id from public.create_projects
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and archived_at is null`,
    [actor.kind, actor.id, candidate],
  );
  if (!project) throw new Error("The selected project is not available in this workspace.");
  return project.id;
}

async function readCreateToolsFromDatabase(): Promise<CreateTool[]> {
  const rows = await glashQuery<DbTool>(
    `select id, slug, name, short_description, category, stage, status, role_access,
            credit_cost, requires_provider, provider_key, is_beta, is_new, is_featured,
            supports_simple_mode, supports_pro_mode, output_formats, admin_notes
       from public.create_tools
      order by is_featured desc, category asc, name asc`,
  );
  if (!rows.length) return DEFAULT_CREATE_TOOLS;

  const fromDb = rows.map(toolFromDb);
  const seen = new Set(fromDb.map((tool) => tool.slug));
  return [
    ...fromDb,
    ...DEFAULT_CREATE_TOOLS.filter((tool) => !seen.has(tool.slug)),
  ];
}

export async function loadCreateTools(): Promise<CreateTool[]> {
  try {
    return await readCreateToolsFromDatabase();
  } catch {
    // Keep Create available during a transient read outage. The admin settings
    // screen deliberately uses the strict reader below so it never presents
    // seeded defaults as though they were the saved management state.
    return DEFAULT_CREATE_TOOLS;
  }
}

export async function loadCreateToolsForAdmin(): Promise<CreateTool[]> {
  return readCreateToolsFromDatabase();
}

export async function getCreateTool(slug: string) {
  const tools = await loadCreateTools();
  return tools.find((tool) => tool.slug === slug) || null;
}

export async function ensureCreateCreditAccount(actor: CreateActor): Promise<CreateCreditAccount> {
  try {
    const row = await glashMaybeOne<Record<string, unknown>>(
      `insert into public.create_credit_accounts (owner_kind, owner_id, monthly_credit_limit)
       values ($1, $2, $3)
       on conflict (owner_kind, owner_id) do update set owner_id = excluded.owner_id
       returning monthly_credit_limit, credits_used, storage_limit_bytes, storage_used_bytes, reset_at`,
      [actor.kind, actor.id, defaultCredits(actor.kind)],
    );
    return {
      monthlyCreditLimit: Number(row?.monthly_credit_limit || defaultCredits(actor.kind)),
      creditsUsed: Number(row?.credits_used || 0),
      storageLimitBytes: Number(row?.storage_limit_bytes || CREATE_STORAGE_LIMIT_BYTES),
      storageUsedBytes: Number(row?.storage_used_bytes || 0),
      resetAt: typeof row?.reset_at === "string" ? row.reset_at : null,
    };
  } catch {
    return {
      monthlyCreditLimit: defaultCredits(actor.kind),
      creditsUsed: 0,
      storageLimitBytes: CREATE_STORAGE_LIMIT_BYTES,
      storageUsedBytes: 0,
      resetAt: null,
    };
  }
}

export async function loadCreateDashboardData(actor: CreateActor): Promise<CreateDashboardData> {
  // One wave, not two. The tool catalogue and the credit account used to be
  // awaited before the other five reads started, so every open paid for two
  // database round trips in a row when none of these depend on each other.
  const toolsAndCredits = Promise.all([
    loadCreateTools(),
    ensureCreateCreditAccount(actor),
    loadCreateAdvertBanner(),
  ]);
  const dashboardReads = Promise.all([
      glashQuery<{ tool_slug: string }>(
        `select tool_slug from public.create_tool_favorites where owner_kind = $1 and owner_id = $2`,
        actorParams(actor),
      ),
      glashQuery<Record<string, unknown>>(
        `select id, tool_slug, tool_name, title, status, project_id, input_summary, output,
                file_name, file_size_bytes, output_format, is_favorite, created_at, updated_at
           from public.create_creations
          where owner_kind = $1 and owner_id = $2 and deleted_at is null
          order by updated_at desc
          limit 24`,
        actorParams(actor),
      ),
      glashQuery<Record<string, unknown>>(
        `select id, name, description, color, created_at, updated_at
           from public.create_projects
          where owner_kind = $1 and owner_id = $2 and archived_at is null
          order by updated_at desc
          limit 20`,
        actorParams(actor),
      ),
      glashQuery<Record<string, unknown>>(
        `select id, name, category, description, scope, status, preview_url, locked_fields, editable_fields
           from public.create_templates
          where status = 'published'
            and (
              scope in ('global', 'public')
              or scope = $1
              or (scope = 'client' and client_id = $2)
            )
          order by category asc, name asc
          limit 36`,
        actorParams(actor),
      ),
      glashMaybeOne<Record<string, unknown>>(
        `select
            count(*)::int as creations,
            count(*) filter (where status = 'ready')::int as ready,
            count(*) filter (where status = 'provider_required')::int as provider_required,
            coalesce(sum(coalesce(file_size_bytes, 0)), 0)::bigint as storage_used_bytes
           from public.create_creations
          where owner_kind = $1 and owner_id = $2 and deleted_at is null`,
        actorParams(actor),
      ),
    ]);
  const [tools, creditAccount, advertBanner] = await toolsAndCredits;

  try {
    const [favoriteRows, creationRows, projectRows, templateRows, analyticsRow] = await dashboardReads;

    return {
      tools,
      advertBanner,
      favoriteToolSlugs: favoriteRows.map((row) => row.tool_slug),
      recentCreations: creationRows.map(creationFromDb),
      projects: projectRows.map(projectFromDb),
      templates: templateRows.map(templateFromDb),
      creditAccount: {
        ...creditAccount,
        storageUsedBytes: Number(analyticsRow?.storage_used_bytes || creditAccount.storageUsedBytes),
      },
      analytics: {
        creations: Number(analyticsRow?.creations || 0),
        downloads: creationRows.filter((row) => row.status === "ready").length,
        ready: Number(analyticsRow?.ready || 0),
        providerRequired: Number(analyticsRow?.provider_required || 0),
        storageUsedBytes: Number(analyticsRow?.storage_used_bytes || 0),
      },
    };
  } catch {
    return {
      tools,
      advertBanner,
      favoriteToolSlugs: [],
      recentCreations: [],
      projects: [],
      templates: [],
      creditAccount,
      analytics: {
        creations: 0,
        downloads: 0,
        ready: 0,
        providerRequired: 0,
        storageUsedBytes: 0,
      },
    };
  }
}

export async function toggleCreateFavorite(actor: CreateActor, toolSlug: string, favorite: boolean) {
  if (favorite) {
    await glashQuery(
      `insert into public.create_tool_favorites (owner_kind, owner_id, tool_slug)
       values ($1, $2, $3)
       on conflict do nothing`,
      [actor.kind, actor.id, toolSlug],
    );
    return true;
  }
  await glashQuery(
    `delete from public.create_tool_favorites where owner_kind = $1 and owner_id = $2 and tool_slug = $3`,
    [actor.kind, actor.id, toolSlug],
  );
  return false;
}

export async function createCreateProject(actor: CreateActor, input: { name: string; description?: string; color?: string }) {
  const name = cleanText(input.name, 90);
  if (name.length < 2) throw new Error("Add a project name.");
  const row = await glashMaybeOne<Record<string, unknown>>(
    `insert into public.create_projects (owner_kind, owner_id, name, description, color)
     values ($1, $2, $3, $4, $5)
     returning id, name, description, color, created_at, updated_at`,
    [actor.kind, actor.id, name, cleanText(input.description, 500) || null, safeColor(input.color) || "#0A4FE8"],
  );
  if (!row) throw new Error("Could not create project.");
  return projectFromDb(row);
}

export async function deleteCreateCreation(actor: CreateActor, id: string) {
  await glashQuery(
    `update public.create_creations
        set deleted_at = now(), updated_at = now()
      where id = $3::uuid and owner_kind = $1 and owner_id = $2`,
    [actor.kind, actor.id, id],
  );
}

export async function duplicateCreateCreation(actor: CreateActor, id: string) {
  const source = await glashMaybeOne<{ file_size_bytes: string | null }>(
    `select file_size_bytes::text from public.create_creations
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
    [actor.kind, actor.id, id],
  );
  if (!source) throw new Error("Could not duplicate this creation.");
  const reservationId = actor.kind === "client"
    ? await reserveClientStorage(actor.id, Number(source.file_size_bytes || 0))
    : null;
  try {
    const row = await glashMaybeOne<Record<string, unknown>>(
      `insert into public.create_creations
      (owner_kind, owner_id, actor_email, tool_slug, tool_name, title, status, project_id,
       input_summary, output, file_name, file_size_bytes, output_format, is_favorite)
     select owner_kind, owner_id, actor_email, tool_slug, tool_name, title || ' copy', status, project_id,
            input_summary, output, file_name, file_size_bytes, output_format, false
       from public.create_creations
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
      returning id, tool_slug, tool_name, title, status, project_id, input_summary, output,
                file_name, file_size_bytes, output_format, is_favorite, created_at, updated_at`,
      [actor.kind, actor.id, id],
    );
    if (!row) throw new Error("Could not duplicate this creation.");
    return creationFromDb(row);
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}

async function consumeCredits(actor: CreateActor, cost: number) {
  const account = await ensureCreateCreditAccount(actor);
  if (actor.kind !== "admin" && account.creditsUsed + cost > account.monthlyCreditLimit) {
    throw new Error("You do not have enough CREATE credits for this tool.");
  }
  if (cost > 0) {
    await glashQuery(
      `update public.create_credit_accounts
          set credits_used = credits_used + $3
        where owner_kind = $1 and owner_id = $2`,
      [actor.kind, actor.id, cost],
    );
  }
}

/** Lightweight list of the actor's recent creations - used for polling processing jobs. */
export async function listCreateCreations(actor: CreateActor, limit = 24): Promise<CreateCreation[]> {
  const rows = await glashQuery<Record<string, unknown>>(
    `select id, tool_slug, tool_name, title, status, project_id, input_summary, output,
            file_name, file_size_bytes, output_format, is_favorite, created_at, updated_at
       from public.create_creations
      where owner_kind = $1 and owner_id = $2 and deleted_at is null
      order by updated_at desc
      limit $3`,
    [actor.kind, actor.id, Math.min(Math.max(limit, 1), 60)],
  );
  return rows.map((row) => creationFromDb(row));
}

async function refundCredits(actor: CreateActor, cost: number) {
  if (cost <= 0) return;
  await glashQuery(
    `update public.create_credit_accounts set credits_used = greatest(credits_used - $3, 0)
      where owner_kind = $1 and owner_id = $2`,
    [actor.kind, actor.id, cost],
  );
}

async function saveCreation(actor: CreateActor, tool: CreateTool, payload: {
  title: string;
  status: CreateCreation["status"];
  inputSummary: Record<string, unknown>;
  output: Record<string, unknown>;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  outputFormat?: string | null;
  projectId?: string | null;
}) {
  let reservationId: string | null = null;
  try {
    reservationId = actor.kind === "client"
      ? await reserveClientStorage(actor.id, Number(payload.fileSizeBytes || 0))
      : null;
    const row = await glashMaybeOne<Record<string, unknown>>(
      `insert into public.create_creations
      (owner_kind, owner_id, actor_email, tool_slug, tool_name, title, status, project_id,
       input_summary, output, file_name, file_size_bytes, output_format)
     values ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9::jsonb, $10::jsonb, $11, $12, $13)
     returning id, tool_slug, tool_name, title, status, project_id, input_summary, output,
               file_name, file_size_bytes, output_format, is_favorite, created_at, updated_at`,
    [
      actor.kind,
      actor.id,
      actor.email,
      tool.slug,
      tool.name,
      cleanText(payload.title, 140) || tool.name,
      payload.status,
      payload.projectId || null,
      JSON.stringify(payload.inputSummary),
      JSON.stringify(payload.output),
      payload.fileName || null,
      payload.fileSizeBytes || null,
      payload.outputFormat || null,
      ],
    );
    return row ? creationFromDb(row) : null;
  } catch (error) {
    if (actor.kind === "client" && Number(payload.fileSizeBytes || 0) > 0) {
      await refundCredits(actor, tool.creditCost).catch(() => undefined);
    }
    throw error;
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}

async function logUsage(actor: CreateActor, tool: CreateTool, input: {
  status: string;
  creditsUsed: number;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    await glashQuery(
      `insert into public.create_usage_events
        (owner_kind, owner_id, actor_email, tool_slug, event_type, credits_used, status, latency_ms, metadata)
       values ($1, $2, $3, $4, 'generation', $5, $6, $7, $8::jsonb)`,
      [actor.kind, actor.id, actor.email, tool.slug, input.creditsUsed, input.status, input.latencyMs, JSON.stringify(input.metadata || {})],
    );
  } catch {
    /* Analytics must not break the user's creative workflow. */
  }
}

export async function runCreateTool(actor: CreateActor, tool: CreateTool, input: Record<string, unknown>) {
  const started = Date.now();
  if (!tool.roleAccess.includes(actor.kind)) {
    throw new Error("This CREATE tool is not available for your account type.");
  }
  if (tool.status === "disabled") {
    throw new Error("This CREATE tool is currently disabled.");
  }
  // A UUID alone is not authority: the project must belong to this exact
  // server-derived workspace before it may be attached to a creation.
  const projectId = await ownedProjectId(actor, input.projectId);

  const inProcess = IN_PROCESS_SLUGS.has(tool.slug);
  const providerRequired = async () => {
    const output = {
      message: "This tool is configured in CREATE, but no processing brain is connected yet.",
      setupKey: tool.providerKey,
      status: "provider_required",
      nextStep: "Admin can enable a brain (Internal / OpenAI / Magnific / Creattie) for this tool in CREATE Management.",
    };
    const creation = await saveCreation(actor, tool, {
      title: titleForTool(tool, input),
      status: "provider_required",
      inputSummary: summarizeInput(input),
      output,
      fileName: null,
      fileSizeBytes: null,
      outputFormat: null,
      projectId,
    });
    await logUsage(actor, tool, { status: "provider_required", creditsUsed: 0, latencyMs: Date.now() - started, metadata: output });
    return { status: "provider_required" as const, output, creation };
  };

  if (tool.status === "maintenance") return providerRequired();

  // Compute-heavy tools route to the multi-brain engine layer. Most brains
  // (OpenAI, Magnific, Internal) finish within the request budget, so we process
  // synchronously for an immediate result; if no brain is ready, stay gated.
  if (QUEUEABLE_SLUGS.has(tool.slug)) {
    // Tools that must run on an external worker (ffmpeg video, Figma export):
    // queue only when a worker is connected, otherwise stay honestly gated.
    if (ASYNC_WORKER_SLUGS.has(tool.slug)) {
      if (!process.env.CREATE_WORKER_SECRET) return providerRequired();
      await consumeCredits(actor, tool.creditCost);
      const output = { kind: "pending" as const, status: "processing", message: "Your file is queued for processing. It will appear here automatically when ready." };
      const creation = await saveCreation(actor, tool, {
        title: titleForTool(tool, input), status: "processing", inputSummary: summarizeInput(input),
        output, fileName: null, fileSizeBytes: null, outputFormat: null, projectId,
      });
      if (creation) await enqueueCreateJob(actor, tool, input, creation.id);
      await logUsage(actor, tool, { status: "processing", creditsUsed: tool.creditCost, latencyMs: Date.now() - started });
      return { status: "processing" as const, output, creation };
    }

    const chain = await getReadyEngineChain(tool.slug);
    if (chain.length === 0) return providerRequired();
    await consumeCredits(actor, tool.creditCost);
    const outcome = await processQueuedJob({ toolSlug: tool.slug, input });
    if (!outcome.ok) {
      await refundCredits(actor, tool.creditCost); // do not charge for a failed run
      await logUsage(actor, tool, { status: "failed", creditsUsed: 0, latencyMs: Date.now() - started, metadata: { error: outcome.error } });
      throw new Error(outcome.error);
    }
    const creation = await saveCreation(actor, tool, {
      title: outcome.result.title || titleForTool(tool, input),
      status: "ready",
      inputSummary: summarizeInput(input),
      output: outcome.result.output,
      fileName: outcome.result.fileName ?? null,
      fileSizeBytes: outcome.result.fileSizeBytes ?? null,
      outputFormat: outcome.result.outputFormat ?? null,
      projectId,
    });
    await logUsage(actor, tool, { status: "ok", creditsUsed: tool.creditCost, latencyMs: Date.now() - started, metadata: { engine: outcome.engine, cached: outcome.cached } });
    return { status: "ready" as const, output: outcome.result.output, creation };
  }

  // Any remaining provider-gated tool with no in-process generator stays gated.
  if (!providerReady(tool) && !inProcess) return providerRequired();

  await consumeCredits(actor, tool.creditCost);
  const result = await generateLocalResult(tool, input, actor);
  const creation = await saveCreation(actor, tool, {
    title: result.title || titleForTool(tool, input),
    status: "ready",
    inputSummary: summarizeInput(input),
    output: result.output,
    fileName: result.fileName,
    fileSizeBytes: result.fileSizeBytes,
    outputFormat: result.outputFormat,
    projectId,
  });
  await logUsage(actor, tool, { status: "ok", creditsUsed: tool.creditCost, latencyMs: Date.now() - started });
  return { status: "ready" as const, output: result.output, creation };
}

/** Fast text tools that use the OpenAI brain inline when it is ready, else fall back to a local template. */
const ENGINE_SYNC_SLUGS = new Set(["logo-ideator"]);

async function generateLocalResult(tool: CreateTool, input: Record<string, unknown>, actor: CreateActor) {
  if (tool.slug === "brand-name-checker") return runLiveBrandNameCheck(input);
  if (ENGINE_SYNC_SLUGS.has(tool.slug)) {
    const outcome = await processQueuedJob({ toolSlug: tool.slug, input });
    if (outcome.ok) {
      return {
        title: outcome.result.title || tool.name,
        fileName: outcome.result.fileName || null,
        fileSizeBytes: outcome.result.fileSizeBytes ?? null,
        outputFormat: outcome.result.outputFormat || null,
        output: outcome.result.output,
      };
    }
    // else fall through to the local template generator below
  }
  switch (tool.slug) {
    case "barcode-generator":
      return generateBarcode(input);
    case "logo-ideator":
      return generateLogoIdeation(input);
    case "social-media-designer":
      return generateSocialDesign(input, actor);
    case "birthday-template":
      return generateBirthdayTemplate(input);
    case "mockup-generator":
      return generateMockup(input);
    case "jpg-to-svg":
    case "clean-vector-tracer":
      return generateTrace(tool, input);
    case "vector-generator":
      return generateVector(tool, input);
    default:
      return generateToolBrief(tool, input);
  }
}

/** Tools we now run in-process (CPU) even though the catalog marks them provider-gated. */
const IN_PROCESS_SLUGS = new Set(["clean-vector-tracer"]);

/**
 * Compute-heavy tools that run asynchronously on a CPU/GPU worker pool.
 * When their provider env var is set (a worker is connected), a run enqueues a
 * job instead of executing inline; the worker completes it via /api/create/worker.
 */
const QUEUEABLE_SLUGS = new Set([
  "background-remover",
  "image-restorer",
  "video-compressor",
  "illustration-generator",
  "logo-animation",
  "figma-to-illustrator",
]);

/** Queueable tools that require an EXTERNAL worker (ffmpeg / Figma export), not an inline brain. */
const ASYNC_WORKER_SLUGS = new Set(["video-compressor", "figma-to-illustrator"]);

/** Insert a pending job for a worker to claim (async/GPU path). Input is stored as-is (already size-capped by the API). */
export async function enqueueCreateJob(actor: CreateActor, tool: CreateTool, input: Record<string, unknown>, creationId: string) {
  await glashQuery(
    `insert into public.create_jobs
       (creation_id, tool_slug, owner_kind, owner_id, actor_email, credit_cost, input, status)
     values ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, 'pending')`,
    [creationId, tool.slug, actor.kind, actor.id, actor.email, tool.creditCost, JSON.stringify(input)],
  );
}

export interface CreateWorkerJob {
  id: string;
  creationId: string;
  toolSlug: string;
  input: Record<string, unknown>;
  attempts: number;
}

/**
 * Atomically claim the oldest pending job (or a stale claimed one) for a worker.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED so many workers can poll concurrently.
 */
export async function claimNextCreateJob(workerId: string, toolSlugs?: string[]): Promise<CreateWorkerJob | null> {
  const filterClause = toolSlugs && toolSlugs.length ? `and tool_slug = any($2::text[])` : "";
  const params: unknown[] = [workerId];
  if (toolSlugs && toolSlugs.length) params.push(toolSlugs);
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_jobs j
        set status = 'claimed', worker_id = $1, attempts = attempts + 1, claimed_at = now()
      where j.id = (
        select id from public.create_jobs
         where (status = 'pending'
                or (status = 'claimed' and claimed_at < now() - interval '10 minutes'))
           ${filterClause}
         order by created_at
         for update skip locked
         limit 1
      )
      returning id, creation_id, tool_slug, input, attempts`,
    params,
  );
  if (!row) return null;
  return {
    id: String(row.id),
    creationId: String(row.creation_id),
    toolSlug: String(row.tool_slug),
    input: (row.input as Record<string, unknown>) || {},
    attempts: Number(row.attempts || 0),
  };
}

/** Worker reports success: attach the output to the creation and close the job. */
export async function completeCreateJob(jobId: string, result: {
  output: Record<string, unknown>;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  outputFormat?: string | null;
  title?: string | null;
}) {
  const pendingJob = await glashMaybeOne<Record<string, unknown>>(
    `select creation_id, owner_kind, owner_id
       from public.create_jobs
      where id = $1::uuid and status <> 'done'`,
    [jobId],
  );
  if (!pendingJob) return false;
  let reservationId: string | null = null;
  try {
    reservationId = pendingJob.owner_kind === "client"
      ? await reserveClientStorage(String(pendingJob.owner_id), Number(result.fileSizeBytes || 0))
      : null;
    const job = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_jobs
        set status = 'done', finished_at = now(), result = $2::jsonb, error = null
      where id = $1::uuid and status <> 'done'
      returning creation_id`,
    [jobId, JSON.stringify(result.output || {})],
  );
    if (!job) return false;
    await glashQuery(
      `update public.create_creations
        set status = 'ready',
            output = $2::jsonb,
            file_name = coalesce($3, file_name),
            file_size_bytes = coalesce($4, file_size_bytes),
            output_format = coalesce($5, output_format),
            title = coalesce($6, title),
            updated_at = now()
      where id = $1::uuid`,
    [
      String(job.creation_id),
      JSON.stringify(result.output || {}),
      result.fileName ?? null,
      result.fileSizeBytes ?? null,
      result.outputFormat ?? null,
      result.title ? cleanText(result.title, 140) : null,
    ],
    );
    return true;
  } catch (error) {
    if (isClientStorageFullError(error)) {
      await failCreateJob(jobId, error.message, CLIENT_STORAGE_FULL_CODE);
      return false;
    }
    throw error;
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}

/** Worker reports failure: mark the creation failed and refund the credits that were charged. */
export async function failCreateJob(jobId: string, message: string, code?: string) {
  const job = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_jobs
        set status = 'failed', finished_at = now(), error = $2
      where id = $1::uuid and status <> 'done'
      returning creation_id, owner_kind, owner_id, credit_cost`,
    [jobId, cleanText(message, 500) || "Processing failed."],
  );
  if (!job) return false;
  await glashQuery(
    `update public.create_creations
        set status = 'failed',
            output = jsonb_build_object('kind', 'report', 'title', title, 'text', $2::text, 'code', $3::text),
            updated_at = now()
      where id = $1::uuid`,
    [String(job.creation_id), cleanText(message, 500) || "Processing failed.", code || null],
  );
  // Refund the reserved credits so a failed run does not cost the user.
  const cost = Number(job.credit_cost || 0);
  if (cost > 0) {
    await glashQuery(
      `update public.create_credit_accounts
          set credits_used = greatest(credits_used - $3, 0)
        where owner_kind = $1 and owner_id = $2`,
      [String(job.owner_kind), String(job.owner_id), cost],
    );
  }
  return true;
}

/**
 * Claim and fully process the next queued job through the multi-brain engine
 * layer, then flip its creation to ready/failed. Called by the internal
 * processor cron (/api/create/process). Returns a small status summary.
 */
export async function runNextCreateJob(workerId = "process-cron"): Promise<{ processed: boolean; jobId?: string; engine?: string; ok?: boolean; error?: string }> {
  const job = await claimNextCreateJob(workerId, [...QUEUEABLE_SLUGS]);
  if (!job) return { processed: false };
  try {
    const outcome = await processQueuedJob({ toolSlug: job.toolSlug, input: job.input });
    if (outcome.ok) {
      await completeCreateJob(job.id, {
        output: outcome.result.output,
        fileName: outcome.result.fileName ?? null,
        fileSizeBytes: outcome.result.fileSizeBytes ?? null,
        outputFormat: outcome.result.outputFormat ?? null,
        title: outcome.result.title ?? null,
      });
      return { processed: true, jobId: job.id, engine: outcome.engine, ok: true };
    }
    await failCreateJob(job.id, outcome.error);
    return { processed: true, jobId: job.id, ok: false, error: outcome.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed.";
    await failCreateJob(job.id, message);
    return { processed: true, jobId: job.id, ok: false, error: message };
  }
}

/**
 * Real CPU vector tracing (potrace). Converts the uploaded raster into an SVG:
 * - jpg-to-svg uses posterize (multi-tone) for photos/artwork
 * - clean-vector-tracer uses a crisp single-colour trace for logos/line art
 */
async function generateTrace(tool: CreateTool, input: Record<string, unknown>) {
  const dataUrl = typeof input.source === "string" && input.source.startsWith("data:image/")
    ? input.source
    : typeof input.image === "string" && input.image.startsWith("data:image/")
      ? input.image
      : "";
  if (!dataUrl) throw new Error("Upload an image to trace.");
  const raw = Buffer.from(dataUrl.split(",")[1] || "", "base64");
  if (!raw.length) throw new Error("Could not read the uploaded image.");

  const detail = cleanText(input.detailLevel, 40) || "Balanced";
  const color = safeColor(input.foreground) || safeColor(input.brandColor) || "#0D1B39";

  // Normalise: cap dimensions and flatten transparency onto white so every
  // input format traces cleanly and the output SVG stays a sensible size.
  const sharp = (await import("sharp")).default;
  const prepped = await sharp(raw)
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  const mod = (await import("potrace")) as unknown as {
    default?: PotraceModule;
  } & PotraceModule;
  const potrace: PotraceModule = mod.default ?? mod;

  const isPoster = tool.slug === "jpg-to-svg";
  const steps = detail === "High" ? 5 : detail === "Low" ? 3 : 4;
  const turdSize = detail === "High" ? 2 : detail === "Low" ? 40 : 12;

  const svg = await new Promise<string>((resolve, reject) => {
    const done = (err: Error | null, out?: string) => (err || !out ? reject(err || new Error("Trace failed.")) : resolve(out));
    if (isPoster) {
      potrace.posterize(prepped, { steps, color, background: "#ffffff", turdSize }, done);
    } else {
      potrace.trace(prepped, { color, background: "transparent", turdSize }, done);
    }
  });

  const uploadedName = cleanText(input.source__name, 120) || cleanText(input.image__name, 120);
  const baseName = uploadedName.replace(/\.[^.]+$/, "");
  const title = cleanText(input.prompt, 120) || baseName || tool.name;
  return svgResult(title, `${slugify(title || "trace")}.svg`, svg, { traced: true });
}

type PotraceCallback = (err: Error | null, svg: string) => void;
type PotraceModule = {
  trace: (input: Buffer, options: Record<string, unknown>, cb: PotraceCallback) => void;
  posterize: (input: Buffer, options: Record<string, unknown>, cb: PotraceCallback) => void;
};

/** Overlay a white rounded panel + logo image in the centre of a QR svg. */
function injectQrLogo(svg: string, logoDataUrl: string): string {
  const match = svg.match(/viewBox="0 0 ([\d.]+) /);
  const n = match ? parseFloat(match[1]) : 33;
  const size = n * 0.26;
  const pad = size * 1.24;
  const xy = (n - size) / 2;
  const pxy = (n - pad) / 2;
  const r = pad * 0.18;
  const overlay =
    `<rect x="${pxy}" y="${pxy}" width="${pad}" height="${pad}" rx="${r}" fill="#ffffff"/>` +
    `<image href="${logoDataUrl}" x="${xy}" y="${xy}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.replace("</svg>", `${overlay}</svg>`);
}

async function generateBarcode(input: Record<string, unknown>) {
  const value = cleanText(input.value, 500) || "https://cdsspace.pro";
  const kind = cleanText(input.barcodeType, 20).toUpperCase() === "CODE39" ? "CODE39" : "QR";
  const color = safeColor(input.foreground) || "#0D1B39";
  const background = safeColor(input.background) || "#FFFFFF";
  const label = cleanText(input.label, 100);
  // Only QR codes carry a centre logo - line barcodes have no error-correction
  // headroom, so any uploaded logo is ignored for CODE39.
  const logo = typeof input.logo === "string" && input.logo.startsWith("data:image/") ? input.logo : "";

  if (kind === "CODE39") {
    const title = label || value || "Code 39 barcode";
    return svgResult(title, "create-code39.svg", code39Svg(value, { color, background, label }), { value, hasLogo: false });
  }

  // A centre logo needs the highest error correction (H) so it still scans.
  const ec = logo ? "H" : "M";
  let svg = await QRCode.toString(value, { type: "svg", errorCorrectionLevel: ec, margin: 2, color: { dark: color, light: background } });
  let pngDataUrl = await QRCode.toDataURL(value, { errorCorrectionLevel: ec, margin: 2, width: 1024, color: { dark: color, light: background } });

  if (logo) {
    try {
      const sharp = (await import("sharp")).default;
      const logoBuf = Buffer.from(logo.split(",")[1] || "", "base64");
      // SVG download: embed a small logo image at the centre.
      const small = await sharp(logoBuf).resize(256, 256, { fit: "inside" }).png().toBuffer();
      svg = injectQrLogo(svg, `data:image/png;base64,${small.toString("base64")}`);
      // PNG preview: composite a white rounded panel + the logo onto the raster.
      const qrBuf = Buffer.from(pngDataUrl.split(",")[1] || "", "base64");
      const w = (await sharp(qrBuf).metadata()).width || 1024;
      const size = Math.round(w * 0.24);
      const pad = Math.round(size * 1.25);
      const radius = Math.round(pad * 0.18);
      const panel = await sharp(Buffer.from(`<svg width="${pad}" height="${pad}"><rect width="${pad}" height="${pad}" rx="${radius}" fill="#ffffff"/></svg>`)).png().toBuffer();
      const logoPng = await sharp(logoBuf).resize(size, size, { fit: "inside" }).png().toBuffer();
      const composed = await sharp(qrBuf).composite([{ input: panel, gravity: "center" }, { input: logoPng, gravity: "center" }]).png().toBuffer();
      pngDataUrl = `data:image/png;base64,${composed.toString("base64")}`;
    } catch (error) {
      console.error("[create/barcode] logo compositing failed:", error);
    }
  }

  const title = label || value || "QR code";
  return {
    title,
    fileName: "create-qr-code.svg",
    fileSizeBytes: Buffer.byteLength(svg),
    outputFormat: "SVG",
    output: { kind: "barcode", title, value, svg, pngDataUrl, downloadText: svg, mimeType: "image/svg+xml", hasLogo: Boolean(logo) },
  };
}

function code39Svg(value: string, options: { color: string; background: string; label: string }) {
  const safeValue = value.toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, "-").slice(0, 80) || "CDS-SPACE";
  const encoded = `*${safeValue}*`;
  const narrow = 3;
  const wide = 8;
  const height = 110;
  const map: Record<string, string> = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
    "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
    A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
    F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
    K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
    P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
    U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
    Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
    "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
  };
  let x = 24;
  const bars: string[] = [];
  for (const char of encoded) {
    const pattern = map[char] || map["-"];
    for (let i = 0; i < pattern.length; i += 1) {
      const w = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="28" width="${w}" height="${height}" fill="${options.color}"/>`);
      x += w;
    }
    x += narrow;
  }
  const width = x + 24;
  const label = escapeXml(options.label || safeValue);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="190" viewBox="0 0 ${width} 190"><rect width="100%" height="100%" rx="14" fill="${options.background}"/><g>${bars.join("")}</g><text x="${width / 2}" y="166" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="${options.color}">${label}</text></svg>`;
}

function generateBrandNameReport(input: Record<string, unknown>) {
  const brandName = cleanText(input.brandName, 120) || "New brand";
  const industry = cleanText(input.industry, 90) || "general business";
  const compact = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const score = Math.max(42, Math.min(94, 96 - Math.abs(compact.length - 9) * 4 - (/(space|global|tech|digital|studio)$/i.test(compact) ? 10 : 0)));
  const lines = [
    `${brandName} preliminary name review`,
    "",
    `Industry context: ${industry}`,
    `Clarity score: ${score}/100`,
    "",
    "Internal fit",
    `The name is ${compact.length <= 12 ? "short enough for recall and social handles" : "longer than ideal, so abbreviation planning is recommended"}.`,
    "",
    "Domain and social readiness",
    `Likely handle candidates: ${compact}, ${compact}hq, ${compact}co.`,
    `Likely domain candidates: ${compact}.com, ${compact}.co, ${compact}.africa.`,
    "",
    "Risk notes",
    "This is a preliminary review. It does not replace legal trademark clearance, CAC availability, or registry confirmation.",
  ];
  const text = lines.join("\n");
  return {
    title: `${brandName} name review`,
    fileName: `${slugify(brandName)}-name-review.txt`,
    fileSizeBytes: Buffer.byteLength(text),
    outputFormat: "TXT",
    output: {
      kind: "report",
      score,
      title: `${brandName} name review`,
      text,
      downloadText: text,
      mimeType: "text/plain",
    },
  };
}

function generateLogoIdeation(input: Record<string, unknown>) {
  const brandName = cleanText(input.brandName, 120) || "Brand";
  const industry = cleanText(input.industry, 90) || "business";
  const personality = cleanText(input.personality, 120) || "credible, clear and modern";
  const audience = cleanText(input.targetAudience, 160) || "customers who need a trustworthy solution";
  const logoType = cleanText(input.logoType, 80) || "combination mark";
  const text = [
    `${brandName} logo ideation brief`,
    "",
    `Industry: ${industry}`,
    `Target audience: ${audience}`,
    `Personality: ${personality}`,
    `Recommended logo type: ${logoType}`,
    "",
    "Creative direction 1: Confident clarity",
    `A restrained ${logoType} that uses strong spacing, simple geometry, and a direct wordmark to make ${brandName} feel established.`,
    "",
    "Creative direction 2: Signature system",
    "A flexible symbol that can become an app icon, favicon, stamp, and social avatar without losing recognition.",
    "",
    "Typography",
    "Use a modern sans serif with confident terminals, generous counters, and a strong lowercase/uppercase balance.",
    "",
    "Colour possibilities",
    "Start with one primary brand colour, one dark neutral, and one warm or fresh support colour. Avoid noisy palettes until the strategy is clearer.",
    "",
    "Designer note",
    "Treat this as an ideation assistant, not final brand strategy or registered trademark clearance.",
  ].join("\n");
  return {
    title: `${brandName} logo ideas`,
    fileName: `${slugify(brandName)}-logo-ideas.txt`,
    fileSizeBytes: Buffer.byteLength(text),
    outputFormat: "TXT",
    output: {
      kind: "report",
      title: `${brandName} logo ideas`,
      text,
      downloadText: text,
      mimeType: "text/plain",
    },
  };
}

function generateSocialDesign(input: Record<string, unknown>, actor: CreateActor) {
  const headline = cleanText(input.headline, 90) || "Build with confidence";
  const body = cleanText(input.supportingCopy, 180) || "Professional creative output, prepared with CDS Space standards.";
  const cta = cleanText(input.cta, 48) || "Learn more";
  const platform = cleanText(input.platform, 60) || "Instagram post";
  const postType = cleanText(input.postType, 60) || "Announcement";
  const brandColor = safeColor(input.brandColor) || "#0A4FE8";
  const svg = socialCardSvg({ headline, body, cta, platform, postType, brandColor, company: actor.organization });
  return svgResult(`${postType} design`, `${slugify(postType)}-social-design.svg`, svg, { platform, postType });
}

function socialCardSvg(input: { headline: string; body: string; cta: string; platform: string; postType: string; brandColor: string; company: string }) {
  const headline = escapeXml(input.headline);
  const body = wrapSvgText(input.body, 46, 56, 520, 50);
  const cta = escapeXml(input.cta);
  const company = escapeXml(input.company || "CDS Space");
  const postType = escapeXml(input.postType);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#F5F8FF"/><rect x="64" y="64" width="952" height="952" rx="46" fill="#FFFFFF" stroke="#DDE5F4" stroke-width="2"/><rect x="64" y="64" width="952" height="220" rx="46" fill="${input.brandColor}"/><text x="112" y="146" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#FFFFFF">${postType}</text><text x="112" y="228" font-family="Arial, sans-serif" font-size="52" font-weight="800" fill="#FFFFFF">${company}</text><text x="112" y="430" font-family="Arial, sans-serif" font-size="74" font-weight="800" fill="#0D1B39">${headline}</text>${body}<rect x="112" y="820" width="272" height="76" rx="22" fill="${input.brandColor}"/><text x="248" y="868" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#FFFFFF">${cta}</text><text x="112" y="952" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#6B7693">${escapeXml(input.platform)} template</text></svg>`;
}

function imageInput(input: Record<string, unknown>, name: string): string {
  const v = input[name];
  return typeof v === "string" && v.startsWith("data:image/") ? v : "";
}

function imageResult(title: string, fileName: string, buf: Buffer) {
  const pngDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  return {
    title, fileName, fileSizeBytes: buf.length, outputFormat: "PNG",
    output: { kind: "image", title, pngDataUrl, mimeType: "image/png" },
  };
}

async function generateBirthdayTemplate(input: Record<string, unknown>) {
  const name = cleanText(input.personName, 80) || "Celebrant name";
  const position = cleanText(input.position, 80) || "Team member";
  const date = cleanText(input.date, 60) || new Date().toLocaleDateString("en-GB", { month: "long", day: "numeric" });
  const message = cleanText(input.message, 140) || "Wishing you a brilliant year ahead.";

  // If a raw design + person photo are uploaded, composite them for real.
  const base = imageInput(input, "rawDesign");
  const person = imageInput(input, "personImage");
  if (base) {
    try {
      const sharp = (await import("sharp")).default;
      const baseBuf = Buffer.from(base.split(",")[1] || "", "base64");
      const meta = await sharp(baseBuf).metadata();
      const W = meta.width || 1080, H = meta.height || 1080;
      const layers: Array<Record<string, unknown>> = [];
      if (person) {
        const d = Math.round(Math.min(W, H) * 0.3);
        const mask = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
        const face = await sharp(Buffer.from(person.split(",")[1] || "", "base64"))
          .resize(d, d, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
        layers.push({ input: face, top: Math.round(H * 0.1), left: Math.round(W / 2 - d / 2) });
      }
      const fs = Math.round(W * 0.055), fs2 = Math.round(W * 0.03);
      const textSvg = Buffer.from(
        `<svg width="${W}" height="${H}"><text x="${W / 2}" y="${Math.round(H * 0.72)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fs}" font-weight="800" fill="#0D1B39">${escapeXml(name)}</text>` +
        `<text x="${W / 2}" y="${Math.round(H * 0.78)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fs2}" font-weight="700" fill="#6B7693">${escapeXml(position)}</text>` +
        `<text x="${W / 2}" y="${Math.round(H * 0.86)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fs2}" font-weight="700" fill="#0A4FE8">${escapeXml(date)}</text></svg>`);
      layers.push({ input: textSvg, top: 0, left: 0 });
      const out = await sharp(baseBuf).composite(layers).png().toBuffer();
      return imageResult(`${name} birthday`, `${slugify(name)}-birthday.png`, out);
    } catch (error) {
      console.error("[create/birthday] composite failed, using template:", error);
    }
  }

  const svg = birthdaySvg({ name, position, date, message });
  return svgResult(`${name} birthday card`, `${slugify(name)}-birthday-card.svg`, svg);
}

function birthdaySvg(input: { name: string; position: string; date: string; message: string }) {
  const message = wrapSvgText(input.message, 38, 140, 760, 46, "#39445F");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#F5F8FF"/><rect x="70" y="70" width="940" height="940" rx="54" fill="#FFFFFF" stroke="#DDE5F4" stroke-width="2"/><circle cx="540" cy="312" r="154" fill="#EEF4FF" stroke="#0A4FE8" stroke-width="4"/><path d="M466 336c30 30 118 30 148 0" fill="none" stroke="#0A4FE8" stroke-width="14" stroke-linecap="round"/><circle cx="488" cy="286" r="16" fill="#0D1B39"/><circle cx="592" cy="286" r="16" fill="#0D1B39"/><text x="540" y="570" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#0A4FE8">Happy birthday</text><text x="540" y="654" text-anchor="middle" font-family="Arial, sans-serif" font-size="68" font-weight="800" fill="#0D1B39">${escapeXml(input.name)}</text><text x="540" y="710" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#6B7693">${escapeXml(input.position)}</text>${message}<text x="540" y="930" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0A4FE8">${escapeXml(input.date)}</text></svg>`;
}

async function generateMockup(input: Record<string, unknown>) {
  const product = cleanText(input.mockupBase, 80) || "Product package";
  const artwork = cleanText(input.artworkName, 90) || cleanText(input.prompt, 90) || "Brand artwork";
  const brandColor = safeColor(input.brandColor) || "#0A4FE8";

  // If a base/reference photo + artwork are uploaded, place the artwork for real.
  const base = imageInput(input, "reference");
  const art = imageInput(input, "artwork");
  if (base && art) {
    try {
      const sharp = (await import("sharp")).default;
      const baseBuf = Buffer.from(base.split(",")[1] || "", "base64");
      const meta = await sharp(baseBuf).metadata();
      const W = meta.width || 1200, H = meta.height || 1200;
      const artW = Math.round(Math.min(W, H) * 0.4);
      const artBuf = await sharp(Buffer.from(art.split(",")[1] || "", "base64"))
        .resize(artW, artW, { fit: "inside" }).png().toBuffer();
      const out = await sharp(baseBuf).composite([{ input: artBuf, gravity: "center" }]).png().toBuffer();
      return imageResult(`${product} mockup`, `${slugify(product)}-mockup.png`, out);
    } catch (error) {
      console.error("[create/mockup] composite failed, using template:", error);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900" viewBox="0 0 1280 900"><rect width="1280" height="900" fill="#F5F8FF"/><rect x="140" y="92" width="1000" height="716" rx="46" fill="#FFFFFF" stroke="#DDE5F4" stroke-width="2"/><rect x="446" y="196" width="388" height="508" rx="34" fill="${brandColor}"/><rect x="492" y="254" width="296" height="184" rx="24" fill="#FFFFFF" opacity=".94"/><text x="640" y="352" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#0D1B39">${escapeXml(artwork)}</text><text x="640" y="760" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0D1B39">${escapeXml(product)} mockup preview</text></svg>`;
  return svgResult(`${product} mockup`, `${slugify(product)}-mockup.svg`, svg);
}

function generateVector(tool: CreateTool, input: Record<string, unknown>) {
  const prompt = cleanText(input.prompt, 120) || cleanText(input.fileName, 120) || "Minimal delivery icon";
  const brandColor = safeColor(input.brandColor) || "#0A4FE8";
  const detail = cleanText(input.detailLevel, 40) || "Balanced";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720"><rect width="720" height="720" rx="72" fill="#F5F8FF"/><circle cx="360" cy="360" r="224" fill="#FFFFFF" stroke="#DDE5F4" stroke-width="3"/><path d="M244 382c58-106 176-132 250-60 28 27 42 62 40 104-64 30-141 25-196-22-28-24-58-31-94-22z" fill="${brandColor}" opacity=".95"/><path d="M220 420c72 62 184 85 290 38" fill="none" stroke="#0D1B39" stroke-width="18" stroke-linecap="round"/><text x="360" y="620" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#0D1B39">${escapeXml(prompt)}</text><text x="360" y="654" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#6B7693">${escapeXml(tool.name)} - ${escapeXml(detail)} detail</text></svg>`;
  return svgResult(prompt, `${slugify(prompt)}.svg`, svg);
}

function generateToolBrief(tool: CreateTool, input: Record<string, unknown>) {
  const title = titleForTool(tool, input);
  const text = [
    `${title}`,
    "",
    `${tool.name} request captured in CREATE.`,
    "",
    "Inputs",
    ...Object.entries(summarizeInput(input)).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "Next step",
    "Open this saved creation again after the provider integration is enabled.",
  ].join("\n");
  return {
    title,
    fileName: `${slugify(title)}.txt`,
    fileSizeBytes: Buffer.byteLength(text),
    outputFormat: "TXT",
    output: {
      kind: "report",
      title,
      text,
      downloadText: text,
      mimeType: "text/plain",
    },
  };
}

function svgResult(title: string, fileName: string, svg: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    fileName,
    fileSizeBytes: Buffer.byteLength(svg),
    outputFormat: "SVG",
    output: {
      kind: "visual",
      title,
      svg,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      downloadText: svg,
      mimeType: "image/svg+xml",
      ...extra,
    },
  };
}

function titleForTool(tool: CreateTool, input: Record<string, unknown>) {
  return cleanText(input.title, 120)
    || cleanText(input.headline, 120)
    || cleanText(input.brandName, 120)
    || cleanText(input.personName, 120)
    || cleanText(input.label, 120)
    || tool.name;
}

function summarizeInput(input: Record<string, unknown>) {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "fileData" || key === "previewDataUrl") continue;
    if (typeof value === "string") summary[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean") summary[key] = value;
    else if (Array.isArray(value)) summary[key] = value.slice(0, 12).map((item) => String(item).slice(0, 80));
  }
  return summary;
}

function wrapSvgText(value: string, fontSize: number, x: number, y: number, lineHeight: number, fill = "#0D1B39") {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const maxChars = Math.max(18, Math.floor(720 / (fontSize * 0.54)));
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).map((part, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="${fill}">${escapeXml(part)}</text>`
  )).join("");
}

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "create-output";
}

function safeColor(value: unknown) {
  const color = cleanText(value, 24);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function loadCreateAdminData() {
  const [tools, advertBanner] = await Promise.all([loadCreateToolsForAdmin(), loadCreateAdvertBanner()]);
  try {
    const [stats, topTools, daily] = await Promise.all([
      glashMaybeOne<Record<string, unknown>>(
        `select
          (select count(*) from public.create_tools)::int as tools,
          (select count(*) from public.create_creations where deleted_at is null)::int as creations,
          (select count(*) from public.create_usage_events)::int as events,
          (select coalesce(sum(credits_used), 0)::int from public.create_usage_events)::int as credits_used,
          (select coalesce(sum(storage_used_bytes), 0)::bigint from public.create_credit_accounts)::bigint as storage_used_bytes`,
      ),
      glashQuery<Record<string, unknown>>(
        `select tool_slug, count(*)::int as runs, coalesce(sum(credits_used), 0)::int as credits
           from public.create_usage_events
          group by tool_slug
          order by runs desc, tool_slug asc
          limit 12`,
      ),
      glashQuery<Record<string, unknown>>(
        `select date_trunc('day', created_at)::date as day, count(*)::int as runs
           from public.create_usage_events
          where created_at >= now() - interval '14 days'
          group by 1
          order by 1 desc`,
      ),
    ]);
    return { tools, advertBanner, stats, topTools, daily };
  } catch {
    return {
      tools,
      advertBanner,
      stats: { tools: tools.length, creations: 0, events: 0, credits_used: 0, storage_used_bytes: 0 },
      topTools: [],
      daily: [],
    };
  }
}

export async function upsertCreateTool(input: Record<string, unknown>) {
  const slug = slugify(cleanText(input.slug, 80) || cleanText(input.name, 80));
  const name = cleanText(input.name, 120);
  if (!slug || !name) throw new Error("Add a valid tool name.");
  const category = cleanText(input.category, 40) || "Design";
  const status = ["active", "maintenance", "disabled"].includes(cleanText(input.status, 20))
    ? cleanText(input.status, 20)
    : "active";
  const roleAccess = Array.isArray(input.roleAccess)
    ? input.roleAccess.filter((role): role is CreateRole => role === "client" || role === "team" || role === "admin")
    : ["client", "team", "admin"] as CreateRole[];
  const creditCost = Number(input.creditCost);
  if (!Number.isInteger(creditCost) || creditCost < 0 || creditCost > 100000) {
    throw new Error("Credit cost must be a whole number between 0 and 100,000.");
  }
  const row = await glashMaybeOne<DbTool>(
    `insert into public.create_tools
      (slug, name, short_description, category, stage, status, role_access, credit_cost,
       requires_provider, provider_key, is_beta, is_new, is_featured, supports_simple_mode,
       supports_pro_mode, output_formats, admin_notes)
     values ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12,$13,$14,$15,$16::text[],$17)
     on conflict (slug) do update set
       name = excluded.name,
       short_description = excluded.short_description,
       category = excluded.category,
       stage = excluded.stage,
       status = excluded.status,
       role_access = excluded.role_access,
       credit_cost = excluded.credit_cost,
       requires_provider = excluded.requires_provider,
       provider_key = excluded.provider_key,
       is_beta = excluded.is_beta,
       is_new = excluded.is_new,
       is_featured = excluded.is_featured,
       supports_simple_mode = excluded.supports_simple_mode,
       supports_pro_mode = excluded.supports_pro_mode,
       output_formats = excluded.output_formats,
       admin_notes = excluded.admin_notes
     returning id, slug, name, short_description, category, stage, status, role_access,
               credit_cost, requires_provider, provider_key, is_beta, is_new, is_featured,
               supports_simple_mode, supports_pro_mode, output_formats, admin_notes`,
    [
      slug,
      name,
      cleanText(input.shortDescription, 500),
      category,
      ["phase_1", "phase_2", "phase_3"].includes(cleanText(input.stage, 20)) ? cleanText(input.stage, 20) : "phase_1",
      status,
      roleAccess.length ? roleAccess : ["client", "team", "admin"],
      creditCost,
      input.requiresProvider === true,
      cleanText(input.providerKey, 80) || null,
      input.isBeta === true,
      input.isNew === true,
      input.isFeatured === true,
      input.supportsSimpleMode !== false,
      input.supportsProMode === true,
      Array.isArray(input.outputFormats) ? input.outputFormats.map((format) => cleanText(format, 20)).filter(Boolean) : [],
      cleanText(input.adminNotes, 1000) || null,
    ],
  );
  if (!row) throw new Error("Could not save CREATE tool.");
  return toolFromDb(row);
}

export async function updateCreateToolStatus(slugValue: unknown, statusValue: unknown) {
  const slug = slugify(cleanText(slugValue, 80));
  const status = cleanText(statusValue, 20);
  if (!slug) throw new Error("Select a valid Create tool.");
  if (status !== "active" && status !== "maintenance" && status !== "disabled") {
    throw new Error("Select a valid tool status.");
  }
  const row = await glashMaybeOne<DbTool>(
    `update public.create_tools
        set status = $2
      where slug = $1
      returning id, slug, name, short_description, category, stage, status, role_access,
                credit_cost, requires_provider, provider_key, is_beta, is_new, is_featured,
                supports_simple_mode, supports_pro_mode, output_formats, admin_notes`,
    [slug, status],
  );
  if (!row) throw new Error("The selected Create tool does not exist.");
  const saved = toolFromDb(row);
  if (saved.status !== status) throw new Error("The tool status could not be verified after saving.");
  return saved;
}
