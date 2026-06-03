/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship raw TS/TSX; let Next transpile them.
  transpilePackages: ['@onyxhawk/types', '@onyxhawk/ui-tokens'],
};

export default nextConfig;
