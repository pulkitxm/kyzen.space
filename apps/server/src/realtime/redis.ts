import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server as IOServer } from "socket.io";
import { env } from "../env";
import { childLogger } from "../logger";

const log = childLogger({ mod: "realtime:redis" });

export function attachRedisAdapter(io: IOServer): void {
  if (!env.redisUrl) {
    log.info("single-node mode (no REDIS_URL)");
    return;
  }
  const pub = new Redis(env.redisUrl);
  const sub = pub.duplicate();
  for (const [name, conn] of [
    ["pub", pub],
    ["sub", sub],
  ] as const) {
    conn.on("error", (err) => log.error({ err, conn: name }, "redis error"));
  }
  io.adapter(createAdapter(pub, sub));
  log.info("redis adapter attached (multi-node scale-out)");
}
