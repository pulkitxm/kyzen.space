import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import cors from "cors";
import express from "express";
import { app as honoApp } from "./api";
import { attachRealtime } from "./realtime";
import { env } from "./env";

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
    console.error(err);
    process.exit(1);
  })
  .listen(env.port, env.host, () => {
    console.log(`> GameLobby server ready on http://${env.host}:${env.port}`);
  });
