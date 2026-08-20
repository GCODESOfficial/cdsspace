import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { ensureWotdPrint } from "@/lib/content-hub/wotd-print";
import { getBrandingWordDateKey } from "@/lib/branding-word-of-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function dateAtOffset(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Noon UTC always remains on the requested calendar date in Lagos.
  return new Date(Date.UTC(year, month - 1, day + offset, 12));
}

export async function POST(request: Request) {
  const { session, deny } = await requireContentHub("content_hub.create");
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as {
    days?: unknown;
    replace_existing?: unknown;
  };
  const requestedDays = Number(body.days ?? 1);
  const days = Number.isFinite(requestedDays)
    ? Math.max(1, Math.min(7, Math.trunc(requestedDays)))
    : 1;
  const replaceExisting = body.replace_existing === true;
  const startDateKey = getBrandingWordDateKey();
  const actor = {
    name: session!.name || session!.email || "WOTD print",
    id: session!.memberId || session!.email,
  };
  const results: Awaited<ReturnType<typeof ensureWotdPrint>>[] = [];

  try {
    // Keep this sequential. Each completed day becomes part of WOTD history
    // before the next word is selected, which guarantees unique words in a batch.
    for (let offset = 0; offset < days; offset += 1) {
      const result = await ensureWotdPrint(
        actor,
        dateAtOffset(startDateKey, offset),
        { replaceExisting },
      );
      results.push(result);

      await logActivity({
        action: result.created
          ? "content.wotd_print.create"
          : result.replaced
            ? "content.wotd_print.replace"
            : "content.wotd_print.exists",
        page: "content-hub",
        resource_type: "content",
        resource_id: typeof result.item?.id === "string" ? result.item.id : null,
        resource_label: `WOTD print ${result.date_key}: ${result.word.word}`,
        metadata: {
          date_key: result.date_key,
          created: result.created,
          replaced: result.replaced,
          word_id: result.word.id,
          batch_days: days,
          batch_position: offset + 1,
        },
      });
    }

    const createdCount = results.filter((result) => result.created).length;
    const replacedCount = results.filter((result) => result.replaced).length;
    const response = {
      ok: true,
      days,
      created_count: createdCount,
      replaced_count: replacedCount,
      existing_count: results.length - createdCount - replacedCount,
      start_date_key: results[0]?.date_key || startDateKey,
      end_date_key: results.at(-1)?.date_key || startDateKey,
      results,
    };

    // Preserve the original single-day response fields for existing clients.
    return NextResponse.json(days === 1 ? { ...response, ...results[0] } : response);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "WOTD print failed.",
        days,
        completed_count: results.length,
        created_count: results.filter((result) => result.created).length,
        results,
      },
      { status: 500 },
    );
  }
}
