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

export function getGlashDbBrowserConfig(): Pick<GlashDbRuntimeConfig, "url" | "anonKey"> {
  const glashUrl = process.env.NEXT_PUBLIC_GLASHDB_URL;
  if (glashUrl) {
    return {
      url: glashUrl,
      anonKey: requireEnv(process.env.NEXT_PUBLIC_GLASHDB_ANON_KEY, "NEXT_PUBLIC_GLASHDB_ANON_KEY"),
    };
  }

  return {
    url: requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_GLASHDB_URL, NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getGlashDbServerConfig(): GlashDbRuntimeConfig {
  const glashUrl = firstPresent(process.env.GLASHDB_URL, process.env.NEXT_PUBLIC_GLASHDB_URL);
  if (glashUrl) {
    return {
      url: glashUrl,
      anonKey: requireEnv(process.env.NEXT_PUBLIC_GLASHDB_ANON_KEY, "NEXT_PUBLIC_GLASHDB_ANON_KEY"),
      serviceRoleKey: process.env.GLASHDB_SERVICE_ROLE_KEY,
    };
  }

  return {
    url: requireEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      "GLASHDB_URL, NEXT_PUBLIC_GLASHDB_URL, NEXT_PUBLIC_SUPABASE_URL",
    ),
    anonKey: requireEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getGlashDbServiceRoleConfig(): GlashDbRuntimeConfig & { serviceRoleKey: string } {
  const config = getGlashDbServerConfig();
  return {
    ...config,
    serviceRoleKey: requireEnv(config.serviceRoleKey, "GLASHDB_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getGlashDbDatabaseUrl(): string {
  return requireEnv(process.env.DATABASE_URL, "DATABASE_URL");
}

export function getGlashDbDirectUrl(): string {
  return requireEnv(firstPresent(process.env.DIRECT_URL, process.env.DATABASE_URL), "DIRECT_URL, DATABASE_URL");
}
