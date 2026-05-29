import type { Server as HTTPServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { connectMongoose } from "@/database/mongoose";
import { getAuth } from "@/lib/auth";
import { handleJoinRoom, handleMakeMove } from "@/ws/handlers/tic-tac-toe";

export function attachSocketIOServer(httpServer: HTTPServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      await connectMongoose();
      const cookie = socket.handshake.headers.cookie;
      const session = await getAuth().api.getSession({
        headers: new Headers(cookie ? { cookie } : {}),
      });
      const userId = session?.user?.id;
      if (!userId) {
        next(new Error("Unauthorized"));
        return;
      }
      socket.data.userId = userId;
      next();
    } catch (e) {
      next(e instanceof Error ? e : new Error("Auth failed"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_room", (payload: unknown, cb?: (err?: string) => void) => {
      void (async () => {
        try {
          if (
            !payload ||
            typeof payload !== "object" ||
            !("gameId" in payload) ||
            typeof (payload as { gameId: unknown }).gameId !== "string"
          ) {
            cb?.("Invalid payload");
            socket.emit("game_error", { message: "Invalid join_room payload" });
            return;
          }
          await handleJoinRoom(io, socket, {
            gameId: (payload as { gameId: string }).gameId,
          });
          cb?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "join_room failed";
          cb?.(msg);
          socket.emit("game_error", { message: msg });
        }
      })();
    });

    socket.on("make_move", (payload: unknown, cb?: (err?: string) => void) => {
      void (async () => {
        try {
          if (
            !payload ||
            typeof payload !== "object" ||
            !("gameId" in payload) ||
            typeof (payload as { gameId: unknown }).gameId !== "string" ||
            !("moveData" in payload) ||
            typeof (payload as { moveData: unknown }).moveData !== "object" ||
            (payload as { moveData: unknown }).moveData === null
          ) {
            cb?.("Invalid payload");
            socket.emit("game_error", { message: "Invalid make_move payload" });
            return;
          }
          const p = payload as {
            gameId: string;
            moveData: { row: number; col: number };
          };
          await handleMakeMove(io, socket, {
            gameId: p.gameId,
            moveData: p.moveData,
          });
          cb?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "make_move failed";
          cb?.(msg);
          socket.emit("game_error", { message: msg });
        }
      })();
    });
  });

  return io;
}
