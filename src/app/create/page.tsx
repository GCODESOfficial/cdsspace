import { CreateApp } from "@/components/create/CreateApp";
import { getCreateActor, parseCreateWorkspaceKind, publicCreateActor } from "@/lib/create-platform/session";
import { loadCreateDashboardData } from "@/lib/create-platform/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "CREATE by CDS Space",
  description: "Professional creative tools powered by CDS Space.",
};

/**
 * Loaded on the server so the first paint is the studio itself.
 *
 * The page used to ship an empty shell that, once its JavaScript had downloaded
 * and started, asked /api/create/session who the visitor was - and showed a
 * full-screen spinner for that whole chain. Resolving it here removes a full
 * browser round trip and the spinner with it; the database sits beside the
 * server, so the same work costs a fraction of what it did from the browser.
 */
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const requestedWorkspace = parseCreateWorkspaceKind((await searchParams).workspace);
  const actor = await getCreateActor(requestedWorkspace).catch(() => null);
  const workspaceKind = actor?.kind || requestedWorkspace || "client";
  if (!actor) return <CreateApp workspaceKind={workspaceKind} initial={{ authed: false, actor: null, data: null }} />;
  const data = await loadCreateDashboardData(actor).catch(() => null);
  // If the dashboard could not be read here, the client fetches it as before
  // rather than rendering an empty studio.
  return <CreateApp workspaceKind={workspaceKind} initial={data ? { authed: true, actor: publicCreateActor(actor), data } : undefined} />;
}
