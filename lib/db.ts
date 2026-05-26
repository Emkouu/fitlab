import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Singleton across HMR in dev (otherwise Next.js would spin up a new client
// per reload and exhaust the pool). Runtime app code uses DATABASE_URL —
// the pooled Supabase connection (port 6543). Migrations/seed go through
// DIRECT_URL via prisma.config.ts.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
