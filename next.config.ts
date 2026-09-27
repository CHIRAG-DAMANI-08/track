import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone mode for production deployments
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  
  // Server external packages for Prisma
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;
