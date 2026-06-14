import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
  prismaSchemaFingerprint?: string;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

function buildSchemaFingerprint() {
  return Prisma.dmmf.datamodel.models
    .map((model) => `${model.name}:${model.fields.map((field) => field.name).join(",")}`)
    .join("|");
}

const pool = globalForPrisma.pgPool ?? new Pool({ connectionString });
const adapter = new PrismaPg(pool);

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

function resolvePrismaClient() {
  const fingerprint = buildSchemaFingerprint();
  const cached = globalForPrisma.prisma;
  if (cached && globalForPrisma.prismaSchemaFingerprint === fingerprint) {
    return cached;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.pgPool = pool;
    globalForPrisma.prismaSchemaFingerprint = fingerprint;
  }
  return client;
}

export const prisma = resolvePrismaClient();
