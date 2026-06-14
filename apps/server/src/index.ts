import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { ping } from "@kyzen/database";
import cors from "cors";
import express from "express";
import { app as honoApp } from "./api";
import { env } from "./env";
import { withTimeout } from "./lib/with-timeout";
import { logger } from "./logger";
import { attachRealtime } from "./realtime";
import { runHealthProbe } from "./realtime/health";
import { redisStatus } from "./realtime/redis";

const HEALTH_CHECK_TIMEOUT_MS = 2000;

const server = express();

server.use(
  cors({
    origin: env.webUrl,
    credentials: true,
  }),
);

server.get("/health", async (_req, res) => {
  const db = await withTimeout(ping(), HEALTH_CHECK_TIMEOUT_MS)
    .then(() => "ok" as const)
    .catch((err) => {
      logger.warn({ err }, "health check: db ping failed");
      return "error" as const;
    });
  const redis = await withTimeout(redisStatus(), HEALTH_CHECK_TIMEOUT_MS).catch(
    (err) => {
      logger.warn({ err }, "health check: redis status failed");
      return "error" as const;
    },
  );
  const probe = await runHealthProbe(HEALTH_CHECK_TIMEOUT_MS);
  const ok = db === "ok" && redis !== "error" && probe !== "error";
  res
    .status(ok ? 200 : 503)
    .json({ ok, service: "kyzen-server", db, redis, probe });
});

const honoListener = getRequestListener(honoApp.fetch);
server.all(/^\/api(\/.*)?$/, (req, res) => {
  void honoListener(req, res);
});

const httpServer = createServer(server);

attachRealtime(httpServer);

httpServer
  .once("error", (err) => {
    logger.fatal({ err }, "http server failed to start");
    process.exit(1);
  })
  .listen(env.port, env.host, () => {
    logger.info(
      { host: env.host, port: env.port, env: env.nodeEnv },
      "Kyzen server ready",
    );
  });

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});
