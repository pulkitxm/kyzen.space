import { defineConfig } from "drizzle-kit";

/**
 * Run from the repo root with the single root env:
 *   bun --env-file=.env drizzle-kit generate
 *   bun --env-file=.env drizzle-kit migrate
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./apps/server/src/db/schema.ts",
  out: "./apps/server/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
