import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { createGlashServerQueryClient } from "@/lib/glashdb/query-server";
import { getGlashDbServerConfig } from "./env";
import { getGlashRealtimeOptions } from "./realtime-transport";

type PendingRouteCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

function wrapServerClient(compat: ReturnType<typeof createServerClient>) {
  return createGlashServerQueryClient({
    auth: compat.auth,
    storage: compat.storage,
    channel: compat.channel.bind(compat),
    removeChannel: compat.removeChannel.bind(compat),
    getChannels: compat.getChannels.bind(compat),
  });
}

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

  return wrapServerClient(compat);
}

/**
 * Create an auth client whose cookie changes can be applied to the exact route
 * response being returned. This is important for OAuth: the provider session
 * and the CDS dashboard gate must reach the browser atomically before the
 * callback navigates to a protected page.
 */
export function createRouteClient(request: NextRequest) {
  const { url, anonKey } = getGlashDbServerConfig();
  const pendingCookies = new Map<string, PendingRouteCookie>();

  const compat = createServerClient(url, anonKey, {
    realtime: getGlashRealtimeOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((cookie) => pendingCookies.set(cookie.name, cookie));
      },
    },
  });

  return {
    client: wrapServerClient(compat),
    applyCookies<T extends NextResponse>(response: T): T {
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    },
  };
}
