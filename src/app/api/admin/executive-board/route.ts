/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import {
  BUDGET_CATEGORIES,
  BUDGET_STATUSES,
  EXPANSION_BUDGET_PRIORITIES,
  EXPANSION_BUDGET_STATUSES,
  EXPANSION_BUDGET_TYPES,
  MODEL_STATUSES,
  STEP_STATUSES,
  TARGET_STATUSES,
  currentBudgetPeriod,
} from "@/lib/executive-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown) {
  const candidate = str(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : "";
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  // Keep it inside numeric(16,2) so a bad paste cannot blow up the insert.
  return Math.max(-99_999_999_999_999, Math.min(99_999_999_999_999, Math.round(amount * 100) / 100));
}

function nonNegativeMoney(value: unknown) {
  return Math.max(0, money(value));
}

/** A recurring line repeats into at most this many following months. */
const MAX_BUDGET_REPEAT_MONTHS = 2;

function monthAfter(year: number, month: number, steps: number) {
  const index = year * 12 + (month - 1) + steps;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Copies each budget line into the next `months` months as a planned line with
 * nothing spent yet. A month that already holds a copy from the same
 * recurrence group is skipped, so repeating twice never doubles a line.
 */
async function repeatBudgetLines(ids: string[], months: number, actor: string) {
  const sources = await glashQuery<any>(
    `update public.executive_budgets
        set recurrence_group_id = coalesce(recurrence_group_id, id)
      where id = any($1::uuid[])
      returning id, recurrence_group_id, budget_year, budget_month`,
    [ids],
  );
  let created = 0;
  for (const source of sources) {
    for (let step = 1; step <= months; step += 1) {
      const target = monthAfter(Number(source.budget_year), Number(source.budget_month), step);
      const rows = await glashQuery<any>(
        `insert into public.executive_budgets
           (title, category, period_label, currency, planned_amount, actual_amount, owner, status, notes,
            created_by, updated_by, budget_year, budget_month, recurrence_group_id)
         select title, category, '', currency, planned_amount, 0, owner,
                case when status = 'closed' then 'draft' else status end, notes,
                $2, $2, $3, $4, recurrence_group_id
           from public.executive_budgets
          where id = $1
            and not exists (
              select 1 from public.executive_budgets existing
               where existing.recurrence_group_id = $5
                 and existing.budget_year = $3 and existing.budget_month = $4
            )
         returning id`,
        [source.id, actor, target.year, target.month, source.recurrence_group_id],
      );
      created += rows.length;
    }
  }
  return created;
}

function isoDate(value: unknown) {
  const candidate = str(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function pick<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const candidate = str(value, 40);
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T[number]) : fallback;
}

function currency(value: unknown) {
  const code = str(value, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

/**
 * Mirrors every live revenue model into a target for the current month.
 *
 * A revenue model states what a line of business should bring in; a target is
 * the monthly commitment to it. Rather than asking the team to retype one into
 * the other, each active model gets a target for this month carrying its
 * monthly value, created the first time the month is seen and refreshed
 * thereafter.
 *
 * The refresh only touches the figure and the naming. Progress, status, owner
 * and notes belong to whoever is working the target, so they are never
 * overwritten. Retired and paused models stop generating new months but keep
 * the months already recorded.
 */
async function syncRevenueModelTargets(actor: string) {
  const start = new Date();
  const periodMonth = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`;
  // Last day of the month, reached by stepping to day 0 of the next one.
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const dueOn = end.toISOString().slice(0, 10);

  await glashQuery(
    `insert into public.executive_targets
       (title, metric, unit, target_value, current_value, due_on, model_id, status,
        source, period_month, created_by, updated_by)
     select
       m.name,
       'Monthly revenue',
       m.currency,
       case when coalesce(m.target_monthly_value, 0) > 0
            then m.target_monthly_value
            else round(coalesce(m.target_annual_value, 0) / 12.0, 2) end,
       0,
       $1::date,
       m.id,
       'on_track',
       'revenue_model',
       $2::date,
       $3,
       $3
     from public.executive_revenue_models m
     where m.status in ('active', 'piloting')
     on conflict (model_id, period_month) where source = 'revenue_model'
     do update set
       title = excluded.title,
       unit = excluded.unit,
       target_value = excluded.target_value,
       due_on = excluded.due_on,
       updated_at = now()`,
    [dueOn, periodMonth, actor],
  );
}

type ExecutiveBoardView = "overview" | "budgets" | "expansion-budgets" | "targets" | "models" | "vault";

function executiveBoardView(value: string): ExecutiveBoardView {
  return ["budgets", "expansion-budgets", "targets", "models", "vault"].includes(value)
    ? value as ExecutiveBoardView
    : "overview";
}

const VIEW_PERMISSION: Record<ExecutiveBoardView, string> = {
  overview: "executive_board.view",
  budgets: "executive_board.budgets_view",
  "expansion-budgets": "executive_board.expansion_budgets_view",
  targets: "executive_board.targets_view",
  models: "executive_board.models_view",
  vault: "executive_board.vault_view",
};

/** Load only the board area the current route is authorised to expose. */
async function loadBoard(draftActorId: string, view: ExecutiveBoardView) {
  const overview = view === "overview";
  const [budgets, expansionBudgets, expansionDrafts, models, steps, targets, folders, files, shares] = await Promise.all([
    overview || view === "budgets"
      ? glashQuery<any>(`select * from public.executive_budgets order by budget_year desc, budget_month desc, created_at desc limit 2000`)
      : Promise.resolve([]),
    overview || view === "expansion-budgets"
      ? glashQuery<any>(`select * from public.executive_expansion_budgets order by target_start asc, created_at desc limit 500`)
      : Promise.resolve([]),
    view === "expansion-budgets"
      ? glashQuery<any>(
        `select payload, updated_at
           from public.executive_expansion_budget_drafts
          where actor_id=$1
          limit 1`,
        [draftActorId],
      )
      : Promise.resolve([]),
    overview || view === "models"
      ? glashQuery<any>(`select * from public.executive_revenue_models order by position asc, created_at asc limit 200`)
      : Promise.resolve([]),
    overview || view === "models"
      ? glashQuery<any>(`select * from public.executive_revenue_steps order by position asc, created_at asc limit 2000`)
      : Promise.resolve([]),
    overview || view === "targets"
      ? glashQuery<any>(`select * from public.executive_targets order by due_on asc nulls last, created_at desc limit 500`)
      : Promise.resolve([]),
    overview || view === "vault"
      ? glashQuery<any>(`select id, parent_id, name, description, password_hash, created_at from public.executive_vault_folders order by name asc limit 500`)
      : Promise.resolve([]),
    overview || view === "vault"
      ? glashQuery<any>(`select id, folder_id, title, description, kind, file_name, file_mime, file_size_bytes, password_hash, created_at, source_kind, source_id, link_url from public.executive_vault_files order by created_at desc limit 1000`)
      : Promise.resolve([]),
    view === "vault"
      ? glashQuery<any>(`select * from public.executive_vault_shares order by created_at desc limit 500`)
      : Promise.resolve([]),
  ]);

  const folderHasPassword = new Map<string, boolean>();
  folders.forEach((folder) => folderHasPassword.set(folder.id, !!folder.password_hash));

  return {
    budgets,
    expansionBudgets,
    expansionDraft: expansionDrafts[0] ?? null,
    models: models.map((model) => ({
      ...model,
      steps: steps.filter((step) => step.model_id === model.id),
    })),
    targets,
    folders: folders.map(({ password_hash, ...folder }) => ({ ...folder, has_password: !!password_hash })),
    files: files.map(({ password_hash, ...file }) => ({
      ...file,
      has_password: !!password_hash,
      // A file with no password of its own is still gated when it sits in a
      // protected folder, and the UI has to say so.
      inherits_password: !password_hash && !!file.folder_id && !!folderHasPassword.get(file.folder_id),
    })),
    shares: shares.map(({ password_hash, ...share }: any) => ({ ...share, has_password: !!password_hash })),
  };
}

export async function GET(req: NextRequest) {
  const view = executiveBoardView(str(req.nextUrl.searchParams.get("view"), 40));
  const { session, denied } = await requireAdmin(req, VIEW_PERMISSION[view]);
  if (denied) return denied;
  try {
    // Kept current on read, so a new month brings its targets with it without
    // anyone having to remember. Failing here must not take the board down.
    if (view === "overview" || view === "targets") {
      try {
        await syncRevenueModelTargets(session?.email || "system");
      } catch {
        // The board is still perfectly usable without this month's generated rows.
      }
    }
    const draftActorId = session?.memberId || session?.email.toLowerCase() || "system";
    return NextResponse.json({ ok: true, ...(await loadBoard(draftActorId, view)) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load the Executive Board." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = str(body.action, 60);

  // Money and plans are separately permissioned from the document vault.
  const permission = action.includes("expansion_budget")
    ? "executive_board.expansion_budgets"
    : action.includes("budget")
      ? "executive_board.budgets"
      : action.includes("target")
        ? "executive_board.targets"
        : action.includes("model") || action.includes("step")
          ? "executive_board.models"
          : "executive_board.view";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const actor = session.email;
  const draftActorId = session.memberId || session.email.toLowerCase();

  try {
    /* ---------------- Expansion budgets ---------------- */
    if (action === "save_expansion_budget_draft") {
      const payload = body.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return NextResponse.json({ ok: false, error: "A valid expansion budget draft is required." }, { status: 400 });
      }
      const serialized = JSON.stringify(payload);
      if (serialized.length > 30_000) {
        return NextResponse.json({ ok: false, error: "The expansion budget draft is too large." }, { status: 413 });
      }
      const saved = await glashMaybeOne<any>(
        `insert into public.executive_expansion_budget_drafts (actor_id, actor_name, payload)
         values ($1,$2,$3::jsonb)
         on conflict (actor_id) do update
           set actor_name=excluded.actor_name, payload=excluded.payload, updated_at=now()
         returning updated_at`,
        [draftActorId, session.name || session.email, serialized],
      );
      return NextResponse.json({ ok: true, updated_at: saved?.updated_at });
    }

    if (action === "delete_expansion_budget_draft") {
      await glashQuery(`delete from public.executive_expansion_budget_drafts where actor_id=$1`, [draftActorId]);
      return NextResponse.json({ ok: true });
    }

    if (action === "save_expansion_budget") {
      const id = uuid(body.id);
      const title = str(body.title, 200);
      const targetStart = isoDate(body.target_start);
      const targetEnd = isoDate(body.target_end);
      if (!title) return NextResponse.json({ ok: false, error: "An expansion budget needs a title." }, { status: 400 });
      if (!targetStart) return NextResponse.json({ ok: false, error: "Choose the planned start date." }, { status: 400 });
      if (targetEnd && targetEnd < targetStart) {
        return NextResponse.json({ ok: false, error: "The target end date cannot be before the start date." }, { status: 400 });
      }
      const values = [
        title,
        pick(body.expansion_type, EXPANSION_BUDGET_TYPES, "new_market"),
        str(body.location, 240) || null,
        str(body.rationale, 4000) || null,
        targetStart,
        targetEnd,
        currency(body.currency),
        nonNegativeMoney(body.estimated_amount),
        nonNegativeMoney(body.contingency_amount),
        nonNegativeMoney(body.committed_amount),
        str(body.funding_source, 500) || null,
        str(body.owner, 160) || null,
        pick(body.priority, EXPANSION_BUDGET_PRIORITIES, "medium"),
        pick(body.status, EXPANSION_BUDGET_STATUSES, "idea"),
        str(body.expected_outcome, 4000) || null,
        str(body.notes, 4000) || null,
        actor,
      ];
      const row = id
        ? await glashMaybeOne<any>(
            `update public.executive_expansion_budgets
                set title=$1, expansion_type=$2, location=$3, rationale=$4, target_start=$5,
                    target_end=$6, currency=$7, estimated_amount=$8, contingency_amount=$9,
                    committed_amount=$10, funding_source=$11, owner=$12, priority=$13,
                    status=$14, expected_outcome=$15, notes=$16, updated_by=$17, updated_at=now()
              where id=$18 returning *`,
            [...values, id],
          )
        : await glashMaybeOne<any>(
            `insert into public.executive_expansion_budgets
               (title,expansion_type,location,rationale,target_start,target_end,currency,estimated_amount,
                contingency_amount,committed_amount,funding_source,owner,priority,status,expected_outcome,
                notes,created_by,updated_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
             returning *`,
            values,
          );
      if (!row) return NextResponse.json({ ok: false, error: "Expansion budget not found." }, { status: 404 });
      await glashQuery(`delete from public.executive_expansion_budget_drafts where actor_id=$1`, [draftActorId]);
      await logActivity({
        action: id ? "executive_board.expansion_budget.update" : "executive_board.expansion_budget.create",
        page: "executive-board/expansion-budgets",
        resource_type: "executive_expansion_budget",
        resource_id: row.id,
        resource_label: title,
        metadata: {
          target_start: targetStart,
          status: row.status,
          priority: row.priority,
          forecast: `${row.currency} ${Number(row.estimated_amount || 0) + Number(row.contingency_amount || 0)}`,
        },
      });
      return NextResponse.json({ ok: true, expansionBudget: row });
    }

    if (action === "delete_expansion_budget") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Expansion budget is invalid." }, { status: 400 });
      const existing = await glashMaybeOne<any>(`select title from public.executive_expansion_budgets where id=$1`, [id]);
      await glashQuery(`delete from public.executive_expansion_budgets where id=$1`, [id]);
      await logActivity({
        action: "executive_board.expansion_budget.delete",
        page: "executive-board/expansion-budgets",
        resource_type: "executive_expansion_budget",
        resource_id: id,
        resource_label: existing?.title || id,
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- Budgets ---------------- */
    if (action === "save_budget") {
      const id = uuid(body.id);
      const title = str(body.title, 200);
      if (!title) return NextResponse.json({ ok: false, error: "A budget needs a title." }, { status: 400 });
      const today = currentBudgetPeriod();
      const budgetYear = Number(body.budget_year ?? today.year);
      const budgetMonth = Number(body.budget_month ?? today.month);
      if (!Number.isInteger(budgetYear) || budgetYear < 2000 || budgetYear > 2100 || !Number.isInteger(budgetMonth) || budgetMonth < 1 || budgetMonth > 12) {
        return NextResponse.json({ ok: false, error: "Choose the month and year this budget line belongs to." }, { status: 400 });
      }
      const values = [
        title,
        pick(body.category, BUDGET_CATEGORIES, "operations"),
        str(body.period_label, 80),
        isoDate(body.period_start),
        isoDate(body.period_end),
        currency(body.currency),
        money(body.planned_amount),
        money(body.actual_amount),
        str(body.owner, 160) || null,
        pick(body.status, BUDGET_STATUSES, "draft"),
        str(body.notes, 4000) || null,
        actor,
        budgetYear,
        budgetMonth,
      ];
      const row = id
        ? await glashMaybeOne<any>(
            `update public.executive_budgets
                set title=$1, category=$2, period_label=$3, period_start=$4, period_end=$5, currency=$6,
                    planned_amount=$7, actual_amount=$8, owner=$9, status=$10, notes=$11,
                    updated_by=$12, budget_year=$13, budget_month=$14, updated_at=now()
              where id=$15 returning *`,
            [...values, id],
          )
        : await glashMaybeOne<any>(
            `insert into public.executive_budgets
               (title,category,period_label,period_start,period_end,currency,planned_amount,actual_amount,owner,status,notes,created_by,updated_by,budget_year,budget_month)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14) returning *`,
            values,
          );
      const repeatMonths = Math.trunc(Number(body.repeat_months || 0));
      if (!id && row?.id && repeatMonths > 0) {
        await repeatBudgetLines([row.id], Math.min(repeatMonths, MAX_BUDGET_REPEAT_MONTHS), actor);
      }
      await logActivity({
        action: id ? "executive_board.budget.update" : "executive_board.budget.create",
        page: "executive-board/budgets",
        resource_type: "executive_budget",
        resource_id: row?.id,
        resource_label: title,
      });
      return NextResponse.json({ ok: true, budget: row });
    }

    if (action === "move_budgets" || action === "repeat_budgets") {
      const ids: string[] = Array.from(new Set<string>(
        (Array.isArray(body.ids) ? body.ids : []).map((value: unknown) => uuid(value)).filter(Boolean) as string[],
      )).slice(0, 500);
      if (!ids.length) return NextResponse.json({ ok: false, error: "Choose at least one budget line." }, { status: 400 });

      if (action === "move_budgets") {
        const year = Number(body.budget_year);
        const month = Number(body.budget_month);
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
          return NextResponse.json({ ok: false, error: "Choose the month to move these lines to." }, { status: 400 });
        }
        const moved = await glashQuery<any>(
          `update public.executive_budgets
              set budget_year = $2, budget_month = $3, updated_by = $4, updated_at = now()
            where id = any($1::uuid[])
            returning id, title`,
          [ids, year, month, actor],
        );
        await logActivity({
          action: "executive_board.budget.move",
          page: "executive-board/budgets",
          resource_type: "executive_budget",
          resource_label: `${moved.length} line${moved.length === 1 ? "" : "s"} to ${year}-${String(month).padStart(2, "0")}`,
          metadata: { lines: moved.map((line: any) => line.title), budget_year: year, budget_month: month },
        });
        return NextResponse.json({ ok: true, moved: moved.length });
      }

      const months = Math.trunc(Number(body.months));
      if (!Number.isInteger(months) || months < 1 || months > MAX_BUDGET_REPEAT_MONTHS) {
        return NextResponse.json({ ok: false, error: `A budget line can repeat for the next 1 or ${MAX_BUDGET_REPEAT_MONTHS} months only.` }, { status: 400 });
      }
      const created = await repeatBudgetLines(ids, months, actor);
      await logActivity({
        action: "executive_board.budget.repeat",
        page: "executive-board/budgets",
        resource_type: "executive_budget",
        resource_label: `${ids.length} line${ids.length === 1 ? "" : "s"} repeated for ${months} month${months === 1 ? "" : "s"}`,
        metadata: { ids, months, created },
      });
      return NextResponse.json({ ok: true, created });
    }

    if (action === "delete_budget") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Budget is invalid." }, { status: 400 });
      const existing = await glashMaybeOne<any>(`select title from public.executive_budgets where id=$1`, [id]);
      await glashQuery(`delete from public.executive_budgets where id=$1`, [id]);
      await logActivity({
        action: "executive_board.budget.delete",
        page: "executive-board/budgets",
        resource_type: "executive_budget",
        resource_id: id,
        resource_label: existing?.title || id,
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- Targets ---------------- */
    if (action === "save_target") {
      const id = uuid(body.id);
      const title = str(body.title, 200);
      if (!title) return NextResponse.json({ ok: false, error: "A target needs a title." }, { status: 400 });
      const values = [
        title,
        str(body.metric, 160),
        str(body.unit, 40),
        money(body.target_value),
        money(body.current_value),
        isoDate(body.due_on),
        str(body.owner, 160) || null,
        uuid(body.model_id) || null,
        pick(body.status, TARGET_STATUSES, "on_track"),
        str(body.notes, 4000) || null,
        actor,
      ];
      const row = id
        ? await glashMaybeOne<any>(
            `update public.executive_targets
                set title=$1, metric=$2, unit=$3, target_value=$4, current_value=$5, due_on=$6,
                    owner=$7, model_id=$8, status=$9, notes=$10, updated_by=$11, updated_at=now()
              where id=$12 returning *`,
            [...values, id],
          )
        : await glashMaybeOne<any>(
            `insert into public.executive_targets
               (title,metric,unit,target_value,current_value,due_on,owner,model_id,status,notes,created_by,updated_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) returning *`,
            values,
          );
      await logActivity({
        action: id ? "executive_board.target.update" : "executive_board.target.create",
        page: "executive-board/targets",
        resource_type: "executive_target",
        resource_id: row?.id,
        resource_label: title,
      });
      return NextResponse.json({ ok: true, target: row });
    }

    if (action === "delete_target") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Target is invalid." }, { status: 400 });
      await glashQuery(`delete from public.executive_targets where id=$1`, [id]);
      await logActivity({
        action: "executive_board.target.delete",
        page: "executive-board/targets",
        resource_type: "executive_target",
        resource_id: id,
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- Revenue models ---------------- */
    if (action === "save_model") {
      const id = uuid(body.id);
      const name = str(body.name, 200);
      if (!name) return NextResponse.json({ ok: false, error: "A revenue model needs a name." }, { status: 400 });
      const values = [
        name,
        str(body.summary, 4000) || null,
        str(body.pricing_basis, 600) || null,
        pick(body.status, MODEL_STATUSES, "exploring"),
        currency(body.currency),
        money(body.target_annual_value),
        money(body.target_monthly_value),
        str(body.owner, 160) || null,
        Math.max(0, Math.min(999, Math.round(Number(body.position) || 0))),
        actor,
      ];
      const row = id
        ? await glashMaybeOne<any>(
            `update public.executive_revenue_models
                set name=$1, summary=$2, pricing_basis=$3, status=$4, currency=$5,
                    target_annual_value=$6, target_monthly_value=$7, owner=$8, position=$9,
                    updated_by=$10, updated_at=now()
              where id=$11 returning *`,
            [...values, id],
          )
        : await glashMaybeOne<any>(
            `insert into public.executive_revenue_models
               (name,summary,pricing_basis,status,currency,target_annual_value,target_monthly_value,owner,position,created_by,updated_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) returning *`,
            values,
          );
      await logActivity({
        action: id ? "executive_board.model.update" : "executive_board.model.create",
        page: "executive-board/revenue-models",
        resource_type: "executive_revenue_model",
        resource_id: row?.id,
        resource_label: name,
      });
      // A renamed model, a changed figure, or a model becoming active should
      // show up in this month's targets straight away.
      await syncRevenueModelTargets(actor);
      return NextResponse.json({ ok: true, model: row });
    }

    if (action === "delete_model") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Revenue model is invalid." }, { status: 400 });
      await glashQuery(`delete from public.executive_revenue_models where id=$1`, [id]);
      await logActivity({
        action: "executive_board.model.delete",
        page: "executive-board/revenue-models",
        resource_type: "executive_revenue_model",
        resource_id: id,
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- Execution plan steps ---------------- */
    if (action === "save_step") {
      const id = uuid(body.id);
      const modelId = uuid(body.model_id);
      const title = str(body.title, 300);
      if (!title) return NextResponse.json({ ok: false, error: "A step needs a title." }, { status: 400 });
      if (!id && !modelId) return NextResponse.json({ ok: false, error: "Pick a revenue model for this step." }, { status: 400 });
      const values = [
        title,
        str(body.detail, 4000) || null,
        str(body.owner, 160) || null,
        isoDate(body.due_on),
        pick(body.status, STEP_STATUSES, "todo"),
      ];
      const row = id
        ? await glashMaybeOne<any>(
            `update public.executive_revenue_steps
                set title=$1, detail=$2, owner=$3, due_on=$4, status=$5, updated_at=now()
              where id=$6 returning *`,
            [...values, id],
          )
        : await glashMaybeOne<any>(
            `insert into public.executive_revenue_steps (model_id,position,title,detail,owner,due_on,status)
             values ($6, coalesce((select max(position) + 1 from public.executive_revenue_steps where model_id=$6), 0), $1,$2,$3,$4,$5)
             returning *`,
            [...values, modelId],
          );
      return NextResponse.json({ ok: true, step: row });
    }

    if (action === "delete_step") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Step is invalid." }, { status: 400 });
      await glashQuery(`delete from public.executive_revenue_steps where id=$1`, [id]);
      return NextResponse.json({ ok: true });
    }

    if (action === "reorder_steps") {
      const modelId = uuid(body.model_id);
      const ids = Array.isArray(body.ids) ? body.ids.map(uuid).filter(Boolean) : [];
      if (!modelId || !ids.length) return NextResponse.json({ ok: false, error: "Nothing to reorder." }, { status: 400 });
      // Positions are rewritten from the order the client sent, scoped to the
      // model so a stale id from elsewhere cannot be moved.
      for (let index = 0; index < ids.length; index++) {
        await glashQuery(
          `update public.executive_revenue_steps set position=$1, updated_at=now() where id=$2 and model_id=$3`,
          [index, ids[index], modelId],
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Executive Board request failed." },
      { status: 500 },
    );
  }
}
