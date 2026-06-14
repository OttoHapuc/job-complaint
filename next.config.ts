import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["argon2", "pg", "@prisma/client"],
};

export default nextConfig;
