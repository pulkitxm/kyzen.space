import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./client";

/**
 * Apply pending Drizzle migrations. Run from the repo root via the Bun runtime
 * (loads the single root .env):  bun --env-file=.env apps/server/src/db/migrate.ts
 *
 * We use drizzle-orm's programmatic migrator instead of `drizzle-kit migrate`
 * because that CLI only auto-detects a JSON config and ignores --config here.
 *
 * Use fileURLToPath (not URL.pathname) so a space in the repo path isn't left
 * percent-encoded — drizzle reads the folder with fs and would 404 on `%20`.
 */
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

await migrate(db, { migrationsFolder });
await client.end();
console.log("> Migrations applied from", migrationsFolder);
process.exit(0);
