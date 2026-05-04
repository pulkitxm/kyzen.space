import { createServer } from "node:http";
import next from "next";

import { attachSocketIOServer } from "@/ws";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const httpServer = createServer();
const app = next({ dev, hostname, port, httpServer });

app.prepare().then(() => {
  const handler = app.getRequestHandler();
  httpServer.on("request", (req, res) => {
    void handler(req, res);
  });

  attachSocketIOServer(httpServer);

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
