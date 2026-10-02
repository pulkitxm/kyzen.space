import { createServer, type RequestListener } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { ping } from "@kyzen/database";
import { app } from "./api";
import { env } from "./env";
import { withTimeout } from "./lib/with-timeout";
import { logger } from "./logger";
import { attachRealtime } from "./realtime";
import { runHealthProbe } from "./realtime/health";
import { redisStatus } from "./realtime/redis";

export { env, logger };

const HEALTH_CHECK_TIMEOUT_MS = 2000;

export function createPlatformServer(fallback?: RequestListener) {
  const apiListener = getRequestListener(app.fetch);
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname === "/health") {
        const [db, redis, probe] = await Promise.all([
          withTimeout(ping(), HEALTH_CHECK_TIMEOUT_MS)
            .then(() => "ok" as const)
            .catch(() => "error" as const),
          withTimeout(redisStatus(), HEALTH_CHECK_TIMEOUT_MS).catch(
            () => "error" as const,
          ),
          runHealthProbe(HEALTH_CHECK_TIMEOUT_MS),
        ]);
        const ok = db === "ok" && redis !== "error" && probe !== "error";
        res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok, service: "kyzen", db, redis, probe }));
      } else if (pathname === "/api" || pathname.startsWith("/api/")) {
        await apiListener(req, res);
      } else if (fallback) {
        await fallback(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err) {
      logger.error({ err }, "request failed");
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  const io = attachRealtime(server);

  const shutdown = () => {
    io.close();
    server.close();
    const timer = setTimeout(() => process.exit(0), 5000);
    timer.unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return server;
}

export function listen(server: ReturnType<typeof createPlatformServer>) {
  server
    .once("error", (err) => {
      logger.fatal({ err }, "http server failed to start");
      process.exit(1);
    })
    .listen(env.port, env.host, () => {
      logger.info({ host: env.host, port: env.port }, "Kyzen ready");
    });
}
