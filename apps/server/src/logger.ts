import { pino } from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.logLevel || "info",
  base: { service: "gamelobby-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
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

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export type Logger = typeof logger;
