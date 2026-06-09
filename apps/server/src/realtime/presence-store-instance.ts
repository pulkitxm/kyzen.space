import { env } from "../env";
import {
  InMemoryPresenceStore,
  type PresenceStore,
  RedisPresenceStore,
} from "./presence-store";
import { getRedis } from "./redis-client";

function createPresenceStore(): PresenceStore {
  if (!env.redisUrl) return new InMemoryPresenceStore();
  return new RedisPresenceStore(getRedis(), { staleMs: env.presenceStaleMs });
}

export const presenceStore = createPresenceStore();
