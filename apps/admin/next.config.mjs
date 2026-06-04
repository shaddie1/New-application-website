/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export → plain HTML/JS/CSS for Cloudflare Pages.
  output: 'export',
  images: { unoptimized: true },
  // Workspace packages ship raw TS/TSX; let Next transpile them.
  transpilePackages: ['@onyxhawk/types', '@onyxhawk/ui-tokens'],
};

export default nextConfig;
