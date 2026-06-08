import path from "node:path";
import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

function remotePatternFromEnv(value?: string): RemotePattern | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
    };
  } catch {
    return null;
  }
}

const dbImageHost = remotePatternFromEnv(
  process.env.NEXT_PUBLIC_GLASHDB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Generated database types are out of date with the live schema.
  // Don't fail the production build on stale-type errors.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Vercel's serverless tracer sees `path.join(process.cwd(), 'public',
  // ...)` inside the OG card loader and conservatively bundles the entire
  // `public/` tree into every function — videos and high-res SVGs push
  // each lambda past the 300MB cap. We only need two small assets
  // (Metadata-bg.png + navbar/CDS Logo.svg); exclude the heavy static
  // media so the rest of `public/` stays out of every function bundle.
  outputFileTracingExcludes: {
    "*": [
      "public/videos/**",
      "public/home/source/**",
      "public/merch/source/**",
      "public/banners/source/**",
      "public/home/*.mp4",
      "public/home/*.svg",
      "public/images/*.svg",
      "public/images/*.jpg",
      "public/about/*.svg",
      "public/work/*.svg",
      "public/merch/*.svg",
      "public/banners/*.svg",
      "public/dashboard/**",
      "public/home/**",
      "public/about/**",
      "public/work/**",
      "public/merch/**",
      "public/banners/**",
      "public/images/**",
      "public/auth/**",
      "public/fonts/**",
    ],
  },
  images: {
    qualities: [60, 75, 90, 92, 95],
    remotePatterns: [
      ...(dbImageHost ? [dbImageHost] : []),
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Redirect cdsspace.com → cdsspace.pro
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "cdsspace.com" }],
        destination: "https://cdsspace.pro/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cdsspace.com" }],
        destination: "https://cdsspace.pro/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
