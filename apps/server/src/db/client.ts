import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import { withLatency } from "./latency";
import * as schema from "./schema";

const client = withLatency(
  postgres(env.databaseUrl, { max: 10 }),
  env.dbLatencyMs,
);

export const db = drizzle(client, { schema });

export { client, schema };
export type DB = typeof db;
