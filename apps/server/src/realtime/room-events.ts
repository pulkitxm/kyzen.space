import {
  clientCreateRoomSchema,
  clientJoinByCodeSchema,
} from "@kyzen/shared/types";
import type { Socket } from "socket.io";
import { childLogger } from "../logger";
import { createStandaloneGame, validateJoinByCode } from "./rooms-service";

const log = childLogger({ mod: "realtime:rooms" });

type AckFn = (res: unknown) => void;

function rateLimiter(max: number, windowMs: number): () => boolean {
  const hits: number[] = [];
  return () => {
    const now = Date.now();
    while (hits.length > 0 && now - (hits[0] ?? 0) > windowMs) hits.shift();
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
}

export function attachRoomHandlers(socket: Socket): void {
  const createAllowed = rateLimiter(10, 60_000);
  const joinAllowed = rateLimiter(30, 60_000);

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
}
