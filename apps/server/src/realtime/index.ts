import type { Server as HTTPServer } from "node:http";
import { matchChat } from "@kyzen/database";
import {
  clientJoinRoomSchema,
  clientMakeMoveSchema,
} from "@kyzen/shared/types";
import { Server as IOServer } from "socket.io";
import { getAuth } from "../auth";
import { env } from "../env";
import { childLogger } from "../logger";
import { attachChatHandlers, joinUserRooms } from "./chat";
import { attachFriendHandlers } from "./friends";
import { attachGameChatHandlers } from "./games-in-chat";
import { setIO } from "./io";
import { attachMatchChatHandlers } from "./match-chat";
import { attachMatchmakingHandlers } from "./matchmaking";
import { handlePresenceConnect, handlePresenceDisconnect } from "./presence";
import { startPresenceHeartbeats } from "./presence-heartbeat";
import { attachRedisAdapter } from "./redis";
import { attachRoomHandlers } from "./room-events";
import { leaveGameRoom } from "./rooms";
import { registerGameEvent } from "./socket-util";
import { handleJoinRoom, handleMakeMove } from "./turn-based";
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
  startPresenceHeartbeats(io);
  const purge = () => {
    void matchChat
      .purgeExpiredMatchData()
      .catch((err: unknown) => log.error({ err }, "match data cleanup failed"));
  };
  purge();
  const cleanupTimer = setInterval(purge, 3600000);
  cleanupTimer.unref();
  io.engine.on("close", () => clearInterval(cleanupTimer));

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
    attachMatchmakingHandlers(io, socket);
    attachMatchChatHandlers(io, socket);
    attachRoomHandlers(io, socket);
    void handlePresenceConnect(io, socket);

    registerGameEvent(socket, slog, "join_room", clientJoinRoomSchema, (data) =>
      handleJoinRoom(io, socket, data),
    );

    registerGameEvent(socket, slog, "make_move", clientMakeMoveSchema, (data) =>
      handleMakeMove(io, socket, data),
    );

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
