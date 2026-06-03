import type { Redis } from "ioredis";
import { env } from "../env";
import { getRedis } from "./redis-client";

export interface PresenceStore {
  markOnline(userId: string, socketId: string): Promise<{ wasOnline: boolean }>;
  refresh(userId: string, socketId: string): Promise<void>;
  markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }>;
  isOnline(userId: string): Promise<boolean>;
  onlineAmong(userIds: string[]): Promise<Set<string>>;
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly sockets = new Map<string, Set<string>>();

  async markOnline(
    userId: string,
    socketId: string,
  ): Promise<{ wasOnline: boolean }> {
    const set = this.sockets.get(userId);
    const wasOnline = (set?.size ?? 0) > 0;
    if (set) {
      set.add(socketId);
    } else {
      this.sockets.set(userId, new Set([socketId]));
    }
    return { wasOnline };
  }

  async refresh(): Promise<void> {}

  async markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }> {
    const set = this.sockets.get(userId);
    if (!set) return { stillOnline: false };
    set.delete(socketId);
    if (set.size === 0) this.sockets.delete(userId);
    return { stillOnline: set.size > 0 };
  }

  async isOnline(userId: string): Promise<boolean> {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  async onlineAmong(userIds: string[]): Promise<Set<string>> {
    const online = new Set<string>();
    for (const id of userIds) {
      if ((this.sockets.get(id)?.size ?? 0) > 0) online.add(id);
    }
    return online;
  }
}

type RedisPresenceOptions = { staleMs: number; now?: () => number };

export class RedisPresenceStore implements PresenceStore {
  private readonly client: Redis;
  private readonly staleMs: number;
  private readonly now: () => number;
  private readonly expireSeconds: number;

  constructor(client: Redis, opts: RedisPresenceOptions) {
    this.client = client;
    this.staleMs = opts.staleMs;
    this.now = opts.now ?? (() => Date.now());
    this.expireSeconds = Math.ceil(opts.staleMs / 1000) + 5;
  }

  private key(userId: string): string {
    return `presence:${userId}`;
  }

  private async write(userId: string, socketId: string): Promise<void> {
    const key = this.key(userId);
    await this.client.zadd(key, this.now(), socketId);
    await this.client.expire(key, this.expireSeconds);
  }

  async markOnline(
    userId: string,
    socketId: string,
  ): Promise<{ wasOnline: boolean }> {
    const wasOnline = await this.isOnline(userId);
    await this.write(userId, socketId);
    return { wasOnline };
  }

  async refresh(userId: string, socketId: string): Promise<void> {
    await this.write(userId, socketId);
  }

  async markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }> {
    await this.client.zrem(this.key(userId), socketId);
    return { stillOnline: await this.isOnline(userId) };
  }

  async isOnline(userId: string): Promise<boolean> {
    const fresh = this.now() - this.staleMs;
    const count = await this.client.zcount(this.key(userId), fresh, "+inf");
    return count > 0;
  }

  async onlineAmong(userIds: string[]): Promise<Set<string>> {
    const online = new Set<string>();
    await Promise.all(
      userIds.map(async (id) => {
        if (await this.isOnline(id)) online.add(id);
      }),
    );
    return online;
  }
}

export function createPresenceStore(): PresenceStore {
  if (!env.redisUrl) return new InMemoryPresenceStore();
  return new RedisPresenceStore(getRedis(), { staleMs: env.presenceStaleMs });
}

export const presenceStore = createPresenceStore();
