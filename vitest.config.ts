import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    // Load .env so DIRECT_URL is available to the booking engine + tests.
    setupFiles: ["dotenv/config"],
    // Booking engine talks to the real Supabase Postgres. A few seconds of
    // headroom for network + cold-start; the race test occasionally needs
    // more than the 5s default while it waits on two concurrent transactions.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run each test file in its own child process so the Prisma client
    // doesn't bleed connections across files.
    pool: "forks",
  },
});
