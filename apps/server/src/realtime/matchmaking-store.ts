import type { Redis } from "ioredis";
import { env } from "../env";
import { getRedis } from "./redis-client";

interface MatchmakingStore {
  enqueue(gameType: string, userId: string, score: number): Promise<void>;
  remove(gameType: string, userId: string): Promise<void>;
  removeFromAll(userId: string): Promise<void>;
  pairAndPop(gameType: string): Promise<[string, string] | null>;
  members(gameType: string): Promise<string[]>;
  size(gameType: string): Promise<number>;
}

export class InMemoryMatchmakingStore implements MatchmakingStore {
  private readonly queues = new Map<string, Map<string, number>>();

  private queue(gameType: string): Map<string, number> {
    let q = this.queues.get(gameType);
    if (!q) {
      q = new Map<string, number>();
      this.queues.set(gameType, q);
    }
    return q;
  }

  async enqueue(
    gameType: string,
    userId: string,
    score: number,
  ): Promise<void> {
    const q = this.queue(gameType);
    if (!q.has(userId)) q.set(userId, score);
  }

  async remove(gameType: string, userId: string): Promise<void> {
    this.queues.get(gameType)?.delete(userId);
  }

  async removeFromAll(userId: string): Promise<void> {
    for (const q of this.queues.values()) q.delete(userId);
  }

  private ordered(gameType: string): string[] {
    const q = this.queues.get(gameType);
    if (!q) return [];
    return [...q.entries()]
      .sort((x, y) => x[1] - y[1])
      .map(([userId]) => userId);
  }

  async pairAndPop(gameType: string): Promise<[string, string] | null> {
    const order = this.ordered(gameType);
    if (order.length < 2) return null;
    const [a, b] = order;
    if (!a || !b) return null;
    const q = this.queues.get(gameType);
    q?.delete(a);
    q?.delete(b);
    return [a, b];
  }

  async members(gameType: string): Promise<string[]> {
    return this.ordered(gameType);
  }

  async size(gameType: string): Promise<number> {
    return this.queues.get(gameType)?.size ?? 0;
  }
}

const PAIR_AND_POP_LUA = `
local key = KEYS[1]
local pair = redis.call('ZRANGE', key, 0, 1)
if #pair < 2 then
  return {}
end
redis.call('ZREM', key, pair[1], pair[2])
return pair
`;

const ALL_QUEUES_KEY = "mm:queues";

export function queueKey(gameType: string): string {
  return `mm:queue:${gameType}`;
}

export class RedisMatchmakingStore implements MatchmakingStore {
  private readonly client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async enqueue(
    gameType: string,
    userId: string,
    score: number,
  ): Promise<void> {
    await this.client.zadd(queueKey(gameType), "NX", score, userId);
    await this.client.sadd(ALL_QUEUES_KEY, gameType);
  }

  async remove(gameType: string, userId: string): Promise<void> {
    await this.client.zrem(queueKey(gameType), userId);
  }

  async removeFromAll(userId: string): Promise<void> {
    const gameTypes = await this.client.smembers(ALL_QUEUES_KEY);
    await Promise.all(
      gameTypes.map((gameType) => this.client.zrem(queueKey(gameType), userId)),
    );
  }

  async pairAndPop(gameType: string): Promise<[string, string] | null> {
    const result = (await this.client.eval(
      PAIR_AND_POP_LUA,
      1,
      queueKey(gameType),
    )) as string[];
    if (!Array.isArray(result) || result.length < 2) return null;
    const [a, b] = result;
    if (!a || !b) return null;
    return [a, b];
  }

  async members(gameType: string): Promise<string[]> {
    return this.client.zrange(queueKey(gameType), 0, -1);
  }

  async size(gameType: string): Promise<number> {
    return this.client.zcard(queueKey(gameType));
  }
}

function create(): MatchmakingStore {
  if (!env.redisUrl) return new InMemoryMatchmakingStore();
  return new RedisMatchmakingStore(getRedis());
}

export const matchmakingStore: MatchmakingStore = create();
