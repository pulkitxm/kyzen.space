import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { Logger } from "../../logger";
import { logger } from "../../logger";

export type LoggerEnv = {
  Variables: {
    requestId: string;
    log: Logger;
  };
};

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
