import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createGlashServerQueryClient } from "@/lib/glashdb/query-server";
import { getGlashDbServerConfig } from "./env";
import { getGlashRealtimeOptions } from "./realtime-transport";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getGlashDbServerConfig();

  const compat = createServerClient(url, anonKey, {
    realtime: getGlashRealtimeOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot mutate cookies directly; proxy refresh handles it.
        }
      },
    },
  });

  return createGlashServerQueryClient({
    auth: compat.auth,
    storage: compat.storage,
    channel: compat.channel.bind(compat),
    removeChannel: compat.removeChannel.bind(compat),
    getChannels: compat.getChannels.bind(compat),
  });
}
