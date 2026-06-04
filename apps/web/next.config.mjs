/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export → plain HTML/JS/CSS for Cloudflare Pages (the app is a
  // client-rendered SPA that talks to the API at runtime; no server needed).
  output: 'export',
  images: { unoptimized: true },
  // Workspace packages ship raw TS/TSX; let Next transpile them.
  transpilePackages: ['@onyxhawk/types', '@onyxhawk/ui-tokens'],
};

export default nextConfig;
