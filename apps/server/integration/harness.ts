import { expect } from "bun:test";
import { db, friends, schema } from "@gamelobby/database";
import { eq, or, sql } from "drizzle-orm";
import * as conversationsService from "../src/chat/conversations-service";
import * as friendsService from "../src/chat/friends-service";
import type { ErrorStatus, ServiceResult } from "../src/chat/result";

export let DB_UP = false;
try {
  await db.execute(sql`select 1`);
  DB_UP = true;
} catch {
  DB_UP = false;
}

export type TestUser = { id: string; username: string };

export function unwrap<T>(res: ServiceResult<T>): T {
  if (!res.ok) throw new Error(`expected ok, got error: ${res.error}`);
  return res.value;
}

export function expectErr<T>(
  res: ServiceResult<T>,
  status?: ErrorStatus,
): void {
  expect(res.ok).toBe(false);
  if (!res.ok && status !== undefined) expect(res.status).toBe(status);
}

export type Harness = {
  makeUser: (label: string) => Promise<TestUser>;
  befriend: (a: TestUser, b: TestUser) => Promise<void>;
  makeDm: (a: TestUser, b: TestUser) => Promise<string>;
  makeGroup: (
    owner: TestUser,
    name: string,
    memberIds: string[],
  ) => Promise<string>;
  trackGame: (gameId: string) => void;
  cleanup: () => Promise<void>;
};

export function createHarness(prefix: string): Harness {
  const userIds: string[] = [];
  const convIds: string[] = [];
  const gameIds: string[] = [];

  async function makeUser(label: string): Promise<TestUser> {
    const id = `${prefix}_${label}_${crypto.randomUUID()}`;
    const username = `${prefix}_${label}_${crypto.randomUUID().slice(0, 8)}`;
    await db
      .insert(schema.user)
      .values({ id, name: label, email: `${id}@itest.local` });
    await db.insert(schema.userProfile).values({ userId: id, username });
    userIds.push(id);
    return { id, username };
  }

  async function befriend(a: TestUser, b: TestUser): Promise<void> {
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    await friendsService.respondToRequest(b.id, row?.id ?? "", "accept");
  }

  async function makeDm(a: TestUser, b: TestUser): Promise<string> {
    await befriend(a, b);
    const conv = unwrap(await conversationsService.createDm(a.id, b.id));
    convIds.push(conv.id);
    return conv.id;
  }

  async function makeGroup(
    owner: TestUser,
    name: string,
    memberIds: string[],
  ): Promise<string> {
    const conv = unwrap(
      await conversationsService.createGroup(owner.id, name, memberIds),
    );
    convIds.push(conv.id);
    return conv.id;
  }

  function trackGame(gameId: string): void {
    gameIds.push(gameId);
  }

  async function cleanup(): Promise<void> {
    if (!DB_UP) return;
    for (const id of gameIds) {
      await db
        .delete(schema.game)
        .where(or(eq(schema.game.id, id), eq(schema.game.code, id)))
        .catch(() => {});
    }
    for (const id of convIds) {
      await db
        .delete(schema.conversation)
        .where(eq(schema.conversation.id, id))
        .catch(() => {});
    }
    for (const id of userIds) {
      await db
        .delete(schema.user)
        .where(eq(schema.user.id, id))
        .catch(() => {});
    }
  }

  return { makeUser, befriend, makeDm, makeGroup, trackGame, cleanup };
}
