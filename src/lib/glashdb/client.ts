import { createBrowserClient } from "@supabase/ssr";
import { createGlashBrowserQueryClient } from "@/lib/glashdb/query-browser";
import { getGlashDbBrowserConfig } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const { url, anonKey } = getGlashDbBrowserConfig();

  if (!browserClient || typeof window === "undefined") {
    browserClient = createBrowserClient(url, anonKey);
  }

  return createGlashBrowserQueryClient({
    auth: browserClient.auth,
    storage: browserClient.storage,
    channel: browserClient.channel.bind(browserClient),
    removeChannel: browserClient.removeChannel.bind(browserClient),
    getChannels: browserClient.getChannels.bind(browserClient),
  });
}
