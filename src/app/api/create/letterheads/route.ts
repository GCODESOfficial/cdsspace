import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { createLetterhead, letterheadScope, listLetterheads } from "@/lib/create-platform/letterheads";
import { applyCompanyLetterhead, getCompanyLetterhead } from "@/lib/create-platform/company-letterhead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actorOrResponse(request: Request) {
  const actor = await getCreateActorFromRequest(request);
  if (!actor) return { response: NextResponse.json({ error: "Sign in to use Create." }, { status: 401 }) } as const;
  if (actor.accessLocked) return { response: NextResponse.json({ error: "Create is not available on client accounts yet." }, { status: 403 }) } as const;
  return { actor } as const;
}

/** Executive Board documents are company correspondence, so only admins keep them. */
function scopeOrResponse(request: NextRequest, actorKind: string) {
  const scope = letterheadScope(new URL(request.url).searchParams.get("scope"));
  if (scope === "executive_board" && actorKind !== "admin") {
    return { response: NextResponse.json({ error: "Executive Board letterheads are admin only." }, { status: 403 }) } as const;
  }
  return { scope } as const;
}

export async function GET(request: NextRequest) {
  const auth = await actorOrResponse(request);
  if ("response" in auth) return auth.response;
  const scoped = scopeOrResponse(request, auth.actor.kind);
  if ("response" in scoped) return scoped.response;
  try {
    return NextResponse.json(
      { ok: true, letterheads: await listLetterheads(auth.actor, scoped.scope) },
      { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Letterheads could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await actorOrResponse(request);
  if ("response" in auth) return auth.response;
  const scoped = scopeOrResponse(request, auth.actor.kind);
  if ("response" in scoped) return scoped.response;
  try {
    const letterhead = await createLetterhead(auth.actor, scoped.scope);

    // An Executive Board letter is written on the company letterhead, never on
    // a design chosen per document. The design is copied in here, so the rest
    // of the studio treats it exactly like an uploaded one.
    if (scoped.scope === "executive_board") {
      const applied = await applyCompanyLetterhead(auth.actor, letterhead.id);
      if (!applied) {
        const company = await getCompanyLetterhead();
        if (!company.firstPagePath) {
          return NextResponse.json({
            ok: true,
            letterhead,
            warning: "No CDS Space letterhead has been set yet. Upload the company letterhead to apply it to new documents.",
          }, { status: 201 });
        }
      }
      const { getLetterhead } = await import("@/lib/create-platform/letterheads");
      return NextResponse.json({ ok: true, letterhead: await getLetterhead(auth.actor, letterhead.id) }, { status: 201 });
    }

    return NextResponse.json({ ok: true, letterhead }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The letterhead draft could not be created." }, { status: 500 });
  }
}
