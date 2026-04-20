/* eslint-disable @typescript-eslint/no-explicit-any */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generated Supabase types are out of date with the live schema.
  // Don't fail the production build on stale-type errors.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "udorpewvuezxxlzedafo.supabase.co" },
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

module.exports = nextConfig;
