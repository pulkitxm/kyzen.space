import { resolveDbLatencyMs } from "./db/latency";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: optional("NODE_ENV") === "production",

  port: number("PORT", 4000),
  host: optional("HOST", "0.0.0.0"),

  logLevel:
    optional("LOG_LEVEL") ||
    (optional("NODE_ENV") === "production" ? "info" : "debug"),

  databaseUrl: required("DATABASE_URL"),
  dbLatencyMs: resolveDbLatencyMs(
    optional("NODE_ENV", "development"),
    number("DB_LATENCY_MS", 0),
  ),

  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  betterAuthUrl: optional("BETTER_AUTH_URL", "http://localhost:4000"),
  webUrl: optional("WEB_URL", "http://localhost:3000"),

  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),

  redisUrl: optional("REDIS_URL"),
  publicRealtimeUrl:
    optional("PUBLIC_REALTIME_URL") ||
    optional("BETTER_AUTH_URL", "http://localhost:4000"),
} as const;

export function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}
