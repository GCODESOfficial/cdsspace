/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import {
  BUDGET_CATEGORIES,
  BUDGET_STATUSES,
  MODEL_STATUSES,
  STEP_STATUSES,
  TARGET_STATUSES,
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

/** Everything the board page needs, in one round trip. */
async function loadBoard() {
  const [budgets, models, steps, targets, folders, files, shares] = await Promise.all([
    glashQuery<any>(`select * from public.executive_budgets order by period_start desc nulls last, created_at desc limit 500`),
    glashQuery<any>(`select * from public.executive_revenue_models order by position asc, created_at asc limit 200`),
    glashQuery<any>(`select * from public.executive_revenue_steps order by position asc, created_at asc limit 2000`),
    glashQuery<any>(`select * from public.executive_targets order by due_on asc nulls last, created_at desc limit 500`),
    glashQuery<any>(`select id, parent_id, name, description, password_hash, created_at from public.executive_vault_folders order by name asc limit 500`),
    glashQuery<any>(`select id, folder_id, title, description, kind, file_name, file_mime, file_size_bytes, password_hash, created_at, source_kind, source_id, link_url from public.executive_vault_files order by created_at desc limit 1000`),
    glashQuery<any>(`select * from public.executive_vault_shares order by created_at desc limit 500`),
  ]);

  const folderHasPassword = new Map<string, boolean>();
  folders.forEach((folder) => folderHasPassword.set(folder.id, !!folder.password_hash));

  return {
    budgets,
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
  const { denied } = await requireAdmin(req, "executive_board.view");
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await loadBoard()) });
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
  const permission = action.includes("budget")
    ? "executive_board.budgets"
    : action.includes("target")
      ? "executive_board.targets"
      : action.includes("model") || action.includes("step")
        ? "executive_board.models"
        : "executive_board.view";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const actor = session.email;

  try {
    /* ---------------- Budgets ---------------- */
    if (action === "save_budget") {
      const id = uuid(body.id);
      const title = str(body.title, 200);
      if (!title) return NextResponse.json({ ok: false, error: "A budget needs a title." }, { status: 400 });
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
      ];
      const row = id
        ? await glashMaybeOne<any>(
            `update public.executive_budgets
                set title=$1, category=$2, period_label=$3, period_start=$4, period_end=$5, currency=$6,
                    planned_amount=$7, actual_amount=$8, owner=$9, status=$10, notes=$11,
                    updated_by=$12, updated_at=now()
              where id=$13 returning *`,
            [...values, id],
          )
        : await glashMaybeOne<any>(
            `insert into public.executive_budgets
               (title,category,period_label,period_start,period_end,currency,planned_amount,actual_amount,owner,status,notes,created_by,updated_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning *`,
            values,
          );
      await logActivity({
        action: id ? "executive_board.budget.update" : "executive_board.budget.create",
        page: "executive-board/budgets",
        resource_type: "executive_budget",
        resource_id: row?.id,
        resource_label: title,
      });
      return NextResponse.json({ ok: true, budget: row });
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
