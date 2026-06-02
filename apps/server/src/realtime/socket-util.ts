import type { Socket } from "socket.io";
import type { ServiceResult } from "../chat/result";
import { childLogger } from "../logger";

const log = childLogger({ mod: "realtime-chat" });

export type AckFn = (res: unknown) => void;

export function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object";
}

export function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

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
