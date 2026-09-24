import { loadClientAccountState } from "@/lib/client-account";
import { mobileJson, serializeClientMe } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// The signed-in client, their onboarding step and which dashboard modules are
// switched on. The web gets the same data from the dashboard layout.
export async function GET() {
  const load = await loadClientAccountState();
  if (load.status === "signed_out") return mobileJson({ error: "Unauthorized" }, 401);
  if (load.status === "unavailable") return mobileJson({ error: "Temporarily unavailable. Try again." }, 503);
  return mobileJson(await serializeClientMe(load.state));
}
