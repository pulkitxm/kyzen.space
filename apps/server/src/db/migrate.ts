import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./client";

/**
 * Apply pending Drizzle migrations. Run from the repo root via the Bun runtime
 * (loads the single root .env):  bun --env-file=.env apps/server/src/db/migrate.ts
 *
 * We use drizzle-orm's programmatic migrator instead of `drizzle-kit migrate`
 * because that CLI only auto-detects a JSON config and ignores --config here.
 */
const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

await migrate(db, { migrationsFolder });
await client.end();
console.log("> Migrations applied from", migrationsFolder);
process.exit(0);
