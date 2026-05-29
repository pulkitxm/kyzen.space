import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import cors from "cors";
import express from "express";
import { app as honoApp } from "./api";
import { env } from "./env";
import { attachRealtime } from "./realtime";

const server = express();

server.use(
  cors({
    origin: env.webUrl,
    credentials: true,
  }),
);

server.get("/health", (_req, res) => {
  res.json({ ok: true, service: "gamelobby-server" });
});

// Delegate everything under /api to the Hono app (basePath "/api").
const honoListener = getRequestListener(honoApp.fetch);
server.all(/^\/api(\/.*)?$/, (req, res) => {
  void honoListener(req, res);
});

const httpServer = createServer(server);

// Realtime (Socket.IO) shares the same HTTP server.
attachRealtime(httpServer);

httpServer
  .once("error", (err) => {
    logger.fatal({ err }, "http server failed to start");
    process.exit(1);
  })
  .listen(env.port, env.host, () => {
    logger.info(
      { host: env.host, port: env.port, env: env.nodeEnv },
      "GameLobby server ready",
    );
  });

// Surface anything that would otherwise crash silently.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});
