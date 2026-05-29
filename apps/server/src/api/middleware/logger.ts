import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { Logger } from "../../logger";
import { logger } from "../../logger";

/** Context variables added by the logging middleware. */
export type LoggerEnv = {
  Variables: {
    requestId: string;
    log: Logger;
  };
};

/**
 * Per-request structured logging for every /api route.
 *
 * - Assigns a request id (honors an inbound `x-request-id`), echoes it back in
 *   the response header, and binds a child logger to it.
 * - Logs one line per request with method, path, status, and durationMs — the
 *   fields you query for error debugging and load analysis (error rate,
 *   latency percentiles, hot routes). 5xx → error, 4xx → warn, else info.
 * - Handlers can use `c.var.log` to emit request-scoped logs that carry the id.
 */
export const requestLogger: MiddlewareHandler<LoggerEnv> = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  const log = logger.child({ requestId });
  c.set("requestId", requestId);
  c.set("log", log);
  c.header("x-request-id", requestId);

  const start = performance.now();
  try {
    await next();
  } finally {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const status = c.res.status;
    const fields = {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
    };
    if (status >= 500) log.error(fields, "request failed");
    else if (status >= 400) log.warn(fields, "request error");
    else log.info(fields, "request");
  }
};
