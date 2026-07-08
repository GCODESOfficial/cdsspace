import { createClient as createGlashCompatSdkClient } from "@supabase/supabase-js";
import { createGlashBrowserQueryClient } from "@/lib/glashdb/query-browser";
import { getGlashDbBrowserConfig, getGlashDbServiceRoleConfig } from "./env";
import { getGlashRealtimeOptions } from "./realtime-transport";

function createGlashCompatClient(serviceRole = false) {
  try {
    const config = serviceRole ? getGlashDbServiceRoleConfig() : getGlashDbBrowserConfig();
    const key = serviceRole ? getGlashDbServiceRoleConfig().serviceRoleKey : config.anonKey;
    return createGlashCompatSdkClient(config.url, key, {
      auth: {
        persistSession: !serviceRole,
        autoRefreshToken: !serviceRole,
        storageKey: serviceRole ? "glashdb-service-compat" : "glashdb-browser-compat",
      },
      realtime: getGlashRealtimeOptions(),
    });
  } catch {
    return null;
  }
}

const compatBrowser = createGlashCompatClient(false);
const compatAdmin = createGlashCompatClient(true);

export const glashdb = createGlashBrowserQueryClient({
  auth: compatBrowser?.auth,
  storage: compatBrowser?.storage,
  channel: compatBrowser?.channel.bind(compatBrowser),
  removeChannel: compatBrowser?.removeChannel.bind(compatBrowser),
  getChannels: compatBrowser?.getChannels.bind(compatBrowser),
});

export const glashdbAdmin = createGlashBrowserQueryClient({
  auth: compatAdmin?.auth,
  storage: compatAdmin?.storage,
  channel: compatAdmin?.channel.bind(compatAdmin),
  removeChannel: compatAdmin?.removeChannel.bind(compatAdmin),
  getChannels: compatAdmin?.getChannels.bind(compatAdmin),
});

export function getGlashDbAdmin() {
  return glashdbAdmin;
}

// Backward-compatible export names. Database methods on these objects use
// Glash Postgres through DATABASE_URL/DIRECT_URL, while auth/storage/realtime
// use the GlashDB endpoint configured in env.ts.
export const supabase = glashdb;
export const supabaseAdmin = glashdbAdmin;
export const getSupabaseAdmin = getGlashDbAdmin;
