import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server as IOServer } from "socket.io";
import { env } from "../env";

/**
 * Horizontal scale-out: when REDIS_URL is set, attach the Socket.IO redis
 * adapter so room broadcasts fan out across every server instance via Redis
 * pub/sub. No-op (single node) in dev when REDIS_URL is unset.
 */
export function attachRedisAdapter(io: IOServer): void {
  if (!env.redisUrl) {
    console.log("> Realtime: single-node (no REDIS_URL)");
    return;
  }
  const pub = new Redis(env.redisUrl);
  const sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  console.log("> Realtime: redis adapter attached (multi-node scale-out)");
}
