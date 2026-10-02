import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./client";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

await migrate(db, { migrationsFolder });
await client.end();
process.stdout.write(`Migrations applied from ${migrationsFolder}\n`);
process.exit(0);
