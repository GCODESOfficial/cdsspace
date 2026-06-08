import { createClient as createSupabaseSdkClient } from "@supabase/supabase-js";
import { createGlashBrowserQueryClient } from "@/lib/glashdb/query-browser";
import { getGlashDbBrowserConfig, getGlashDbServiceRoleConfig } from "./env";

function createLegacyCompatClient(serviceRole = false) {
  try {
    const config = serviceRole ? getGlashDbServiceRoleConfig() : getGlashDbBrowserConfig();
    const key = serviceRole ? config.serviceRoleKey : config.anonKey;
    return createSupabaseSdkClient(config.url, key, {
      auth: {
        persistSession: !serviceRole,
        autoRefreshToken: !serviceRole,
        storageKey: serviceRole ? "glashdb-service-compat" : "glashdb-browser-compat",
      },
    });
  } catch {
    return null;
  }
}

const legacyBrowser = createLegacyCompatClient(false);
const legacyAdmin = createLegacyCompatClient(true);

export const glashdb = createGlashBrowserQueryClient({
  auth: legacyBrowser?.auth,
  storage: legacyBrowser?.storage,
  channel: legacyBrowser?.channel.bind(legacyBrowser),
  removeChannel: legacyBrowser?.removeChannel.bind(legacyBrowser),
  getChannels: legacyBrowser?.getChannels.bind(legacyBrowser),
});

export const glashdbAdmin = createGlashBrowserQueryClient({
  auth: legacyAdmin?.auth,
  storage: legacyAdmin?.storage,
  channel: legacyAdmin?.channel.bind(legacyAdmin),
  removeChannel: legacyAdmin?.removeChannel.bind(legacyAdmin),
  getChannels: legacyAdmin?.getChannels.bind(legacyAdmin),
});

export function getGlashDbAdmin() {
  return glashdbAdmin;
}

// Backward-compatible export names. Database methods on these objects now use
// Glash Postgres through DATABASE_URL/DIRECT_URL, not the Supabase project URL.
export const supabase = glashdb;
export const supabaseAdmin = glashdbAdmin;
export const getSupabaseAdmin = getGlashDbAdmin;
