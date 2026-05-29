import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./client";

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

await migrate(db, { migrationsFolder });
await client.end();
console.log("> Migrations applied from", migrationsFolder);
process.exit(0);
