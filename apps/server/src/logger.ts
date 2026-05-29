import { pino } from "pino";
import { env } from "./env";

/**
 * Root structured logger.
 *
 * - Production: line-delimited JSON to stdout — cheap to emit and easy to ship
 *   to a log aggregator (Loki/Datadog/CloudWatch) for querying + load analysis
 *   (filter by `status>=500`, percentiles on `durationMs`, counts by `route`).
 * - Development: pretty, colorized, human-readable output via pino-pretty.
 *
 * Level is controlled by LOG_LEVEL (default: debug in dev, info in prod).
 */
export const logger = pino({
  level: env.logLevel,
  base: { service: "gamelobby-server" },
  // ISO timestamps read better in dev and aggregators normalize them fine.
  timestamp: pino.stdTimeFunctions.isoTime,
  // Never let secrets/cookies reach the logs.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "headers.cookie",
      "headers.authorization",
      "*.password",
      "*.token",
      "*.secret",
    ],
    censor: "[redacted]",
  },
  ...(env.isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service",
          },
        },
      }),
});

/** Create a child logger scoped to a subsystem, e.g. logger.child({mod:"realtime"}). */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export type Logger = typeof logger;
