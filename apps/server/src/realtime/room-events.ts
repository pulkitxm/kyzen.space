import {
  clientCreateRoomSchema,
  clientJoinByCodeSchema,
  clientRoomConfigureSchema,
  clientRoomKickSchema,
  clientRoomLeaveSchema,
  clientRoomStartSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { childLogger } from "../logger";
import { configureRoom, kickPlayer, leaveRoom, startRoom } from "./lobby";
import { createStandaloneGame, validateJoinByCode } from "./rooms-service";
import { rateLimiter } from "./socket-util";

const log = childLogger({ mod: "realtime:rooms" });

type AckFn = (res: unknown) => void;

export function attachRoomHandlers(io: IOServer, socket: Socket): void {
  const createAllowed = rateLimiter(10, 60_000);
  const startAllowed = rateLimiter(10, 60_000);
  const joinAllowed = rateLimiter(30, 60_000);
  const lobbyAllowed = rateLimiter(60, 60_000);

  socket.on("room:create", (payload: unknown, cb?: AckFn) => {
    void (async () => {
      const parsed = clientCreateRoomSchema.safeParse(payload);
      if (!parsed.success) {
        cb?.({ ok: false, error: "Invalid payload" });
        return;
      }
      if (!createAllowed()) {
        cb?.({ ok: false, error: "Too many rooms, slow down" });
        return;
      }
      try {
        const res = await createStandaloneGame({
          userId: socket.data.userId,
          gameType: parsed.data.gameType,
          config: parsed.data.config,
        });
        if (res.ok) cb?.({ ok: true, code: res.value.code });
        else cb?.({ ok: false, error: res.error });
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "room:create failed");
        cb?.({ ok: false, error: "Could not create room" });
      }
    })();
  });

  socket.on("room:join", (payload: unknown, cb?: AckFn) => {
    void (async () => {
      const parsed = clientJoinByCodeSchema.safeParse(payload);
      if (!parsed.success || !joinAllowed()) {
        cb?.({ ok: false, error: "not_found" });
        return;
      }
      try {
        const res = await validateJoinByCode({
          userId: socket.data.userId,
          code: parsed.data.code,
        });
        cb?.(res);
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "room:join failed");
        cb?.({ ok: false, error: "not_found" });
      }
    })();
  });

  socket.on("room:configure", (payload: unknown, cb?: AckFn) => {
    void (async () => {
      const parsed = clientRoomConfigureSchema.safeParse(payload);
      if (!parsed.success) {
        cb?.({ ok: false, error: "Invalid payload" });
        return;
      }
      if (!lobbyAllowed()) {
        cb?.({ ok: false, error: "Too many changes, slow down" });
        return;
      }
      try {
        cb?.(
          await configureRoom(
            io,
            socket.data.userId,
            parsed.data.gameId,
            parsed.data.config,
          ),
        );
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "room:configure failed");
        cb?.({ ok: false, error: "Could not update the lobby" });
      }
    })();
  });

  socket.on("room:start", (payload: unknown, cb?: AckFn) => {
    void (async () => {
      const parsed = clientRoomStartSchema.safeParse(payload);
      if (!parsed.success) {
        cb?.({ ok: false, error: "Invalid payload" });
        return;
      }
      if (!startAllowed()) {
        cb?.({ ok: false, error: "Too many starts, slow down" });
        return;
      }
      try {
        cb?.(await startRoom(io, socket.data.userId, parsed.data.gameId));
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "room:start failed");
        cb?.({ ok: false, error: "Could not start the game" });
      }
    })();
  });

  socket.on("room:leave", (payload: unknown, cb?: AckFn) => {
    void (async () => {
      const parsed = clientRoomLeaveSchema.safeParse(payload);
      if (!parsed.success) {
        cb?.({ ok: false, error: "Invalid payload" });
        return;
      }
      if (!lobbyAllowed()) {
        cb?.({ ok: false, error: "Too many changes, slow down" });
        return;
      }
      try {
        cb?.(await leaveRoom(io, socket.data.userId, parsed.data.gameId));
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "room:leave failed");
        cb?.({ ok: false, error: "Could not leave the lobby" });
      }
    })();
  });

  socket.on("room:kick", (payload: unknown, cb?: AckFn) => {
    void (async () => {
      const parsed = clientRoomKickSchema.safeParse(payload);
      if (!parsed.success) {
        cb?.({ ok: false, error: "Invalid payload" });
        return;
      }
      if (!lobbyAllowed()) {
        cb?.({ ok: false, error: "Too many changes, slow down" });
        return;
      }
      try {
        cb?.(
          await kickPlayer(
            io,
            socket.data.userId,
            parsed.data.gameId,
            parsed.data.userId,
          ),
        );
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "room:kick failed");
        cb?.({ ok: false, error: "Could not remove the player" });
      }
    })();
  });
}
