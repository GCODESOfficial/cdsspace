import "server-only";

import { SOCIAL_LABELS, SocialError, type SocialPlatform, type SocialProvider } from "@/lib/social/types";
import { linkedInProvider } from "@/lib/social/providers/linkedin";

/**
 * Env var pair that gates each platform's "configured" state. LinkedIn is fully
 * implemented; the others are scaffolded with the same shape so wiring them up
 * later is just implementing getAuthUrl/exchangeCode/publish - the DB, API,
 * cron, and UI already treat every platform identically.
 */
const CRED_ENV: Record<SocialPlatform, [string, string]> = {
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  facebook: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  instagram: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
};

/** A not-yet-implemented provider that still reports whether creds exist. */
function scaffoldProvider(platform: SocialPlatform): SocialProvider {
  const label = SOCIAL_LABELS[platform];
  const notReady = (): never => {
    throw new SocialError(`${label} auto-publishing is not enabled yet. The connection slot and credentials are ready; posting will be turned on in a follow-up.`, 501);
  };
  const [idEnv, secretEnv] = CRED_ENV[platform];
  return {
    platform,
    label,
    isConfigured: () => Boolean(process.env[idEnv]?.trim() && process.env[secretEnv]?.trim()),
    getAuthUrl: notReady,
    exchangeCode: notReady,
    publish: notReady,
  };
}

const PROVIDERS: Record<SocialPlatform, SocialProvider> = {
  linkedin: linkedInProvider,
  facebook: scaffoldProvider("facebook"),
  instagram: scaffoldProvider("instagram"),
  tiktok: scaffoldProvider("tiktok"),
  x: scaffoldProvider("x"),
};

export function getProvider(platform: SocialPlatform): SocialProvider {
  const provider = PROVIDERS[platform];
  if (!provider) throw new SocialError(`Unknown platform: ${platform}`, 400);
  return provider;
}

/** True once a platform's posting flow is actually implemented (not a scaffold). */
export function isPlatformImplemented(platform: SocialPlatform): boolean {
  return platform === "linkedin";
}

export function credEnvNames(platform: SocialPlatform): [string, string] {
  return CRED_ENV[platform];
}
