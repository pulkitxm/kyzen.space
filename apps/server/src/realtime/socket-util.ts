import type { Socket } from "socket.io";
import type { ServiceResult } from "../chat/result";
import { childLogger, type Logger } from "../logger";

const log = childLogger({ mod: "realtime-chat" });

export type AckFn = (res: unknown) => void;

type GameAck = (err?: string) => void;

type SafeParseResult<T> = { success: true; data: T } | { success: false };

export function ackErr(cb: AckFn | undefined, error: string): void {
  cb?.({ ok: false, error });
}

export function ack<T>(
  cb: AckFn | undefined,
  res: ServiceResult<T>,
  key: string,
): void {
  if (res.ok) cb?.({ ok: true, [key]: res.value });
  else cb?.({ ok: false, error: res.error });
}

export function register(
  socket: Socket,
  event: string,
  fn: (payload: unknown, cb?: AckFn) => Promise<void>,
): void {
  socket.on(event, (payload: unknown, cb?: AckFn) => {
    void (async () => {
      try {
        await fn(payload, cb);
      } catch (e) {
        log.error(
          { err: e, event, userId: socket.data.userId },
          "chat handler failed",
        );
        cb?.({ ok: false, error: e instanceof Error ? e.message : "error" });
      }
    })();
  });
}

export function registerGameEvent<T extends { gameId: string }>(
  socket: Socket,
  slog: Logger,
  event: string,
  schema: { safeParse: (payload: unknown) => SafeParseResult<T> },
  run: (data: T) => Promise<void>,
): void {
  socket.on(event, (payload: unknown, cb?: GameAck) => {
    void (async () => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        slog.warn({ payload }, `invalid ${event} payload`);
        cb?.("Invalid payload");
        socket.emit("game_error", { message: `Invalid ${event} payload` });
        return;
      }
      const { data } = parsed;
      const start = performance.now();
      try {
        await run(data);
        slog.info(
          {
            event,
            gameId: data.gameId,
            durationMs: Math.round((performance.now() - start) * 100) / 100,
          },
          `${event} handled`,
        );
        cb?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${event} failed`;
        slog.error({ err, gameId: data.gameId }, `${event} failed`);
        cb?.(msg);
        socket.emit("game_error", { message: msg });
      }
    })();
  });
}

export function rateLimiter(max: number, windowMs: number): () => boolean {
  const hits: number[] = [];
  return () => {
    const now = Date.now();
    while (hits.length > 0 && now - (hits[0] ?? 0) > windowMs) hits.shift();
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
}
