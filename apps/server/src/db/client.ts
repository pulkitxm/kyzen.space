import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import { withLatency } from "./latency";
import * as schema from "./schema";

// `withLatency` is a no-op unless DB_LATENCY_MS is set, so this is zero-overhead
// in normal runs. Set DB_LATENCY_MS=800 to delay every query for local testing
// of loading states, timeouts and retries.
const client = withLatency(
  postgres(env.databaseUrl, { max: 10 }),
  env.dbLatencyMs,
);

export const db = drizzle(client, { schema });

export { client, schema };
export type DB = typeof db;
