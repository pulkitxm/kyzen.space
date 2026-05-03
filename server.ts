import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3001;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: { origin: true },
    destroyUpgrade: false,
  });

  io.on("connection", (socket) => {
    socket.on("chat:send", (payload: unknown) => {
      const text =
        typeof payload === "object" &&
        payload !== null &&
        "text" in payload &&
        typeof (payload as { text: unknown }).text === "string"
          ? (payload as { text: string }).text
          : "";
      const trimmed = text.trim().slice(0, 2000);
      if (!trimmed) return;

      io.emit("chat:message", {
        id: crypto.randomUUID(),
        socketId: socket.id,
        text: trimmed,
        at: Date.now(),
      });
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});