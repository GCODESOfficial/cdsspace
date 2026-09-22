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
const intelligenceFrameOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_GLASHDB_URL || "https://cdsspace.pro").origin; }
  catch { return "https://cdsspace.pro"; }
})();
const productionSecurity = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  `frame-src 'self' ${intelligenceFrameOrigin} https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com`,
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${productionSecurity ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
  "script-src-attr 'none'",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  ...(productionSecurity ? ["upgrade-insecure-requests"] : []),
].join("; ");
const cmeetFramePolicy = contentSecurityPolicy.replace(
  "frame-ancestors 'self'",
  "frame-ancestors 'self' https://cdsspace.pro https://www.cdsspace.pro https://*.cdsspace.pro",
);
const authenticationNoStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];
const authenticationGatewayPaths = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/:path*",
  "/onboarding",
  "/agreement",
  "/admin/login",
  "/team/login",
  "/team/invite/:path*",
  "/marketer/login",
  "/screening",
];

const nextConfig: NextConfig = {
  // Allow an isolated verification build while a developer server owns .next.
  // Production and normal local development keep the standard directory.
  distDir: process.env.CDS_NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@napi-rs/canvas", "ffmpeg-static"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
  // Tree-shake heavy barrel imports so each page only ships the icons/helpers
  // it actually uses (big win for bundle size + hydration on icon-heavy pages).
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns", "recharts"],
    serverActions: {
      bodySizeLimit: "512kb",
    },
    // Content Hub Visual Library accepts videos up to 100MB. The proxy buffers
    // multipart overhead too, so leave a little headroom above the per-file cap.
    proxyClientMaxBodySize: "110mb",
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
      ...authenticationGatewayPaths.map((source) => ({
        source,
        headers: authenticationNoStoreHeaders,
      })),
      {
        // cMeet is intentionally embeddable inside the authenticated CDS
        // dashboard call panel. Keep every other page locked to SAMEORIGIN,
        // while trusted CDS subdomains rely on frame-ancestors for cMeet.
        source: "/meet/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cmeetFramePolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          ...(productionSecurity ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
        ],
      },
      {
        source: "/:path((?!meet(?:/|$)).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
          ...(productionSecurity ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
        ],
      },
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
        source: "/blog/:path*",
        destination: "/intelligence/:path*",
        permanent: true,
      },
      {
        source: "/dashboard/blog",
        destination: "/dashboard/intelligence",
        permanent: true,
      },
      {
        source: "/:username/dashboard/blog",
        destination: "/:username/dashboard/intelligence",
        permanent: true,
      },
      {
        source: "/admin/blog",
        destination: "/admin/intelligence",
        permanent: true,
      },
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
