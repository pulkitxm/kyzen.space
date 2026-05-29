import type { Server as HTTPServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { getAuth } from "../auth";
import { games } from "../db";
import { env } from "../env";
import { childLogger } from "../logger";
import { getDriver } from "./drivers";
import { attachRedisAdapter } from "./redis";

const log = childLogger({ mod: "realtime" });

function isJoinPayload(p: unknown): p is { gameId: string } {
  return (
    !!p &&
    typeof p === "object" &&
    typeof (p as { gameId?: unknown }).gameId === "string"
  );
}

function isMovePayload(p: unknown): p is { gameId: string; moveData: unknown } {
  return (
    isJoinPayload(p) &&
    "moveData" in p &&
    (p as { moveData?: unknown }).moveData !== undefined &&
    (p as { moveData?: unknown }).moveData !== null
  );
}

/**
 * Attach the realtime layer to the shared HTTP server: authenticate sockets via
 * the Better Auth session cookie, then route generic events through the driver
 * resolved for each game's type.
 */
export function attachRealtime(httpServer: HTTPServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    // WebSocket-only avoids sticky-session requirements behind a load balancer.
    transports: ["websocket"],
    cors: { origin: env.webUrl, credentials: true },
  });

  attachRedisAdapter(io);

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

    socket.on("join_room", (payload: unknown, cb?: (err?: string) => void) => {
      void (async () => {
        if (!isJoinPayload(payload)) {
          slog.warn({ payload }, "invalid join_room payload");
          cb?.("Invalid payload");
          socket.emit("game_error", { message: "Invalid join_room payload" });
          return;
        }
        const start = performance.now();
        try {
          const gameRow = await games.getGameById(payload.gameId);
          const driver = getDriver(gameRow?.gameType ?? "");
          await driver.joinRoom(io, socket, payload);
          slog.info(
            {
              event: "join_room",
              gameId: payload.gameId,
              durationMs: Math.round((performance.now() - start) * 100) / 100,
            },
            "join_room handled",
          );
          cb?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "join_room failed";
          slog.error({ err, gameId: payload.gameId }, "join_room failed");
          cb?.(msg);
          socket.emit("game_error", { message: msg });
        }
      })();
    });

    socket.on("make_move", (payload: unknown, cb?: (err?: string) => void) => {
      void (async () => {
        if (!isMovePayload(payload)) {
          slog.warn({ payload }, "invalid make_move payload");
          cb?.("Invalid payload");
          socket.emit("game_error", { message: "Invalid make_move payload" });
          return;
        }
        const start = performance.now();
        try {
          const gameRow = await games.getGameById(payload.gameId);
          const driver = getDriver(gameRow?.gameType ?? "");
          await driver.makeMove(io, socket, payload);
          slog.info(
            {
              event: "make_move",
              gameId: payload.gameId,
              durationMs: Math.round((performance.now() - start) * 100) / 100,
            },
            "make_move handled",
          );
          cb?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "make_move failed";
          slog.error({ err, gameId: payload.gameId }, "make_move failed");
          cb?.(msg);
          socket.emit("game_error", { message: msg });
        }
      })();
    });

    socket.on("disconnect", (reason) => {
      slog.info({ reason }, "socket disconnected");
    });
  });

  return io;
}
