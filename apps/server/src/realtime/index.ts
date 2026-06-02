import type { Server as HTTPServer } from "node:http";
import {
  clientJoinRoomSchema,
  clientMakeMoveSchema,
} from "@gamelobby/games-core";
import { Server as IOServer } from "socket.io";
import { getAuth } from "../auth";
import { games } from "../db";
import { env } from "../env";
import { childLogger } from "../logger";
import { attachChatHandlers, joinUserRooms } from "./chat";
import { getDriver } from "./drivers";
import { attachFriendHandlers } from "./friends";
import { attachGameChatHandlers } from "./games-in-chat";
import { setIO } from "./io";
import { handlePresenceConnect, handlePresenceDisconnect } from "./presence";
import { attachRedisAdapter } from "./redis";
import { leaveGameRoom } from "./rooms";
import { attachTypingHandlers } from "./typing";

const log = childLogger({ mod: "realtime" });

export function attachRealtime(httpServer: HTTPServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    transports: ["websocket"],
    cors: { origin: env.webUrl, credentials: true },
  });

  attachRedisAdapter(io);
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie;
      const session = await getAuth().api.getSession({
        headers: new Headers(cookie ? { cookie } : {}),
      });
      const userId = session?.user?.id;
      if (!userId) {
        log.debug("socket auth rejected (no session)");
        return next(new Error("Unauthorized"));
      }
      socket.data.userId = userId;
      next();
    } catch (e) {
      log.warn({ err: e }, "socket auth failed");
      next(e instanceof Error ? e : new Error("Auth failed"));
    }
  });

  io.on("connection", (socket) => {
    const slog = log.child({ socketId: socket.id, userId: socket.data.userId });
    slog.info("socket connected");

    void joinUserRooms(socket);
    attachChatHandlers(io, socket);
    attachFriendHandlers(io, socket);
    attachTypingHandlers(io, socket);
    attachGameChatHandlers(io, socket);
    void handlePresenceConnect(io, socket);

    socket.on("join_room", (payload: unknown, cb?: (err?: string) => void) => {
      void (async () => {
        const parsed = clientJoinRoomSchema.safeParse(payload);
        if (!parsed.success) {
          slog.warn({ payload }, "invalid join_room payload");
          cb?.("Invalid payload");
          socket.emit("game_error", { message: "Invalid join_room payload" });
          return;
        }
        const data = parsed.data;
        const start = performance.now();
        try {
          const gameRow = await games.getGameById(data.gameId);
          const driver = getDriver(gameRow?.gameType ?? "");
          await driver.joinRoom(io, socket, data);
          slog.info(
            {
              event: "join_room",
              gameId: data.gameId,
              durationMs: Math.round((performance.now() - start) * 100) / 100,
            },
            "join_room handled",
          );
          cb?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "join_room failed";
          slog.error({ err, gameId: data.gameId }, "join_room failed");
          cb?.(msg);
          socket.emit("game_error", { message: msg });
        }
      })();
    });

    socket.on("make_move", (payload: unknown, cb?: (err?: string) => void) => {
      void (async () => {
        const parsed = clientMakeMoveSchema.safeParse(payload);
        if (!parsed.success) {
          slog.warn({ payload }, "invalid make_move payload");
          cb?.("Invalid payload");
          socket.emit("game_error", { message: "Invalid make_move payload" });
          return;
        }
        const data = parsed.data;
        const start = performance.now();
        try {
          const gameRow = await games.getGameById(data.gameId);
          const driver = getDriver(gameRow?.gameType ?? "");
          await driver.makeMove(io, socket, data);
          slog.info(
            {
              event: "make_move",
              gameId: data.gameId,
              durationMs: Math.round((performance.now() - start) * 100) / 100,
            },
            "make_move handled",
          );
          cb?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "make_move failed";
          slog.error({ err, gameId: data.gameId }, "make_move failed");
          cb?.(msg);
          socket.emit("game_error", { message: msg });
        }
      })();
    });

    socket.on("leave_room", (payload: unknown, cb?: (err?: string) => void) => {
      const parsed = clientJoinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        slog.warn({ payload }, "invalid leave_room payload");
        cb?.("Invalid payload");
        return;
      }
      leaveGameRoom(socket, parsed.data.gameId);
      slog.info(
        { event: "leave_room", gameId: parsed.data.gameId },
        "leave_room handled",
      );
      cb?.();
    });

    socket.on("disconnect", (reason) => {
      slog.info({ reason }, "socket disconnected");
      void handlePresenceDisconnect(io, socket);
    });
  });

  return io;
}
