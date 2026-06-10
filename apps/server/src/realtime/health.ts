import type { Redis } from "ioredis";
import type { Server as IOServer } from "socket.io";
import { withTimeout } from "../lib/with-timeout";
import { childLogger } from "../logger";
import { getIO } from "./io";
import { getRedisPubClient } from "./redis";

const log = childLogger({ mod: "realtime:health" });

const HEALTH_PROBE_ROOM = "health:probe";
const HEALTH_PROBE_EVENT = "health_probe";
const HEALTH_PROBE_CHANNEL = `socket.io#/#${HEALTH_PROBE_ROOM}#`;

type HealthProbeDeps = {
  io: IOServer | null;
  pub: Redis | null;
};

export async function runHealthProbe(
  timeoutMs: number,
  deps: HealthProbeDeps = { io: getIO(), pub: getRedisPubClient() },
): Promise<"ok" | "off" | "error"> {
  const { io, pub } = deps;
  if (!io) {
    log.warn("health probe skipped: io not attached");
    return "error";
  }
  const nonce = crypto.randomUUID();
  if (!pub) {
    io.to(HEALTH_PROBE_ROOM).emit(HEALTH_PROBE_EVENT, {
      nonce,
      at: Date.now(),
    });
    return "off";
  }
  const sub = pub.duplicate();
  try {
    await withTimeout(sub.subscribe(HEALTH_PROBE_CHANNEL), timeoutMs);
    const observed = waitForNonce(sub, nonce, timeoutMs);
    io.to(HEALTH_PROBE_ROOM).emit(HEALTH_PROBE_EVENT, {
      nonce,
      at: Date.now(),
    });
    return (await observed) ? "ok" : "error";
  } catch (err) {
    log.warn({ err }, "health probe failed");
    return "error";
  } finally {
    sub.disconnect();
  }
}

function waitForNonce(
  sub: Redis,
  nonce: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const needle = Buffer.from(nonce);
    const timer = setTimeout(() => {
      sub.off("messageBuffer", onMessage);
      resolve(false);
    }, timeoutMs);
    function onMessage(_channel: Buffer, message: Buffer): void {
      if (!message.includes(needle)) return;
      clearTimeout(timer);
      sub.off("messageBuffer", onMessage);
      resolve(true);
    }
    sub.on("messageBuffer", onMessage);
  });
}
