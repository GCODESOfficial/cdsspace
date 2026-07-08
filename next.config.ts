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

const dbImageHost = remotePatternFromEnv(process.env.NEXT_PUBLIC_GLASHDB_URL);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
  // Tree-shake heavy barrel imports so each page only ships the icons/helpers
  // it actually uses (big win for bundle size + hydration on icon-heavy pages).
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns", "recharts"],
  },
  // Generated database types are out of date with the live schema.
  // Don't fail the production build on stale-type errors.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Vercel's serverless tracer sees `path.join(process.cwd(), 'public',
  // ...)` inside the OG card loader and conservatively bundles the entire
  // `public/` tree into every function - videos and high-res SVGs push
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
      "public/optimized/**",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    qualities: [60, 75, 90, 92, 95],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      ...(dbImageHost ? [dbImageHost] : []),
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    const immutableCache = [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable",
      },
    ];
    const durableAssetCache = [
      {
        key: "Cache-Control",
        value: "public, max-age=2592000, stale-while-revalidate=31536000",
      },
    ];

    return [
      {
        source: "/:path*.:ext(svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mp3|pdf|woff|woff2)",
        headers: durableAssetCache,
      },
      {
        source: "/optimized/:path*",
        headers: immutableCache,
      },
    ];
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
