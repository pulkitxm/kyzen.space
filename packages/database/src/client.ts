import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolveDbLatencyMs, withLatency } from "./latency";
import * as schema from "./schema";

export { schema };

function defaultLatencyMs(): number {
  const raw = Number.parseInt(process.env.DB_LATENCY_MS ?? "", 10);
  const requested = Number.isFinite(raw) ? raw : 0;
  return resolveDbLatencyMs(process.env.NODE_ENV ?? "development", requested);
}

export function createDb(url: string, latencyMs = 0) {
  const connection = withLatency(postgres(url, { max: 10 }), latencyMs);
  return { db: drizzle(connection, { schema }), client: connection };
}

const singleton = createDb(process.env.DATABASE_URL ?? "", defaultLatencyMs());

export const client = singleton.client;
export const db = singleton.db;
export type DB = typeof db;
