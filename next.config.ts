/* eslint-disable @typescript-eslint/no-explicit-any */
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['udorpewvuezxxlzedafo.supabase.co'], // ← your Supabase project domain
  },
  webpack(config: { module: { rules: { test: RegExp; use: string[]; }[]; }; }, { isServer }: any) {
    if (!isServer) {
      config.module.rules.push({
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      });
    }
    return config;
  },
};

module.exports = nextConfig;
