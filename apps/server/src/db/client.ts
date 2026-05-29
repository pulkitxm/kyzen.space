import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Single Drizzle client over the postgres-js driver. (drizzle-orm 0.38 predates
 * the `bun-sql` adapter; postgres-js is the documented fallback and runs fine
 * under Bun.) The connection is lazy, so importing this module is cheap.
 */
const client = postgres(env.databaseUrl, { max: 10 });

export const db = drizzle(client, { schema });

export { client, schema };
export type DB = typeof db;
