type GlashDbRuntimeConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
};

const firstPresent = (...values: Array<string | undefined>) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0);

function requireEnv(value: string | undefined, names: string): string {
  if (!value) {
    throw new Error(`Missing GlashDB environment variable. Expected one of: ${names}`);
  }
  return value;
}

/**
 * pg 8.20 warns when a connection string uses the legacy SSL aliases
 * `prefer`, `require`, or `verify-ca`. Until pg 9 those aliases behave as
 * `verify-full`, so make that behaviour explicit and keep the same secure
 * certificate + hostname verification without a runtime warning.
 */
function normalizePostgresSslMode(value: string): string {
  const connectionString = value.trim();

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    // Preserve non-URL libpq connection strings while still handling the
    // common query-string form safely.
    return connectionString.replace(
      /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/i,
      "$1sslmode=verify-full",
    );
  }
}

export function getGlashDbBrowserConfig(): Pick<GlashDbRuntimeConfig, "url" | "anonKey"> {
  return {
    url: requireEnv(process.env.NEXT_PUBLIC_GLASHDB_URL, "NEXT_PUBLIC_GLASHDB_URL"),
    anonKey: requireEnv(process.env.NEXT_PUBLIC_GLASHDB_ANON_KEY, "NEXT_PUBLIC_GLASHDB_ANON_KEY"),
  };
}

export function getGlashDbServerConfig(): GlashDbRuntimeConfig {
  const glashUrl = firstPresent(process.env.GLASHDB_URL, process.env.NEXT_PUBLIC_GLASHDB_URL);
  return {
    url: requireEnv(glashUrl, "GLASHDB_URL, NEXT_PUBLIC_GLASHDB_URL"),
    anonKey: requireEnv(process.env.NEXT_PUBLIC_GLASHDB_ANON_KEY, "NEXT_PUBLIC_GLASHDB_ANON_KEY"),
    serviceRoleKey: process.env.GLASHDB_SERVICE_ROLE_KEY,
  };
}

export function getGlashDbServiceRoleConfig(): GlashDbRuntimeConfig & { serviceRoleKey: string } {
  const config = getGlashDbServerConfig();
  return {
    ...config,
    serviceRoleKey: requireEnv(config.serviceRoleKey, "GLASHDB_SERVICE_ROLE_KEY"),
  };
}

export function getGlashDbDatabaseUrl(): string {
  return normalizePostgresSslMode(
    requireEnv(firstPresent(process.env.GLASHDB_DATABASE_URL, process.env.DATABASE_URL), "GLASHDB_DATABASE_URL, DATABASE_URL"),
  );
}

export function getGlashDbDirectUrl(): string {
  return normalizePostgresSslMode(
    requireEnv(
      firstPresent(process.env.GLASHDB_DIRECT_URL, process.env.DIRECT_URL, process.env.GLASHDB_DATABASE_URL, process.env.DATABASE_URL),
      "GLASHDB_DIRECT_URL, DIRECT_URL, GLASHDB_DATABASE_URL, DATABASE_URL",
    ),
  );
}
