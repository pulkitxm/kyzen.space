import { Redis } from "ioredis";
import { env } from "../env";
import { childLogger } from "../logger";

const log = childLogger({ mod: "realtime:redis-client" });

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!env.redisUrl) {
    throw new Error("getRedis() called without REDIS_URL");
  }
  if (!client) {
    client = new Redis(env.redisUrl);
    client.on("error", (err) => log.error({ err }, "redis client error"));
  }
  return client;
}
