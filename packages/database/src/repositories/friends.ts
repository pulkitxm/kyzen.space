import type { FriendStatus, FriendshipRow } from "@gamelobby/shared/types";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../client";
import { friendship } from "../schema";

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export async function getFriendshipBetween(
  a: string,
  b: string,
): Promise<FriendshipRow | null> {
  const [row] = await db
    .select()
    .from(friendship)
    .where(eq(friendship.pairKey, pairKey(a, b)))
    .limit(1);
  return row ?? null;
}

export async function getById(id: string): Promise<FriendshipRow | null> {
  const [row] = await db
    .select()
    .from(friendship)
    .where(eq(friendship.id, id))
    .limit(1);
  return row ?? null;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await getFriendshipBetween(a, b);
  return row?.status === "accepted";
}

export async function createRequest(
  requesterId: string,
  addresseeId: string,
): Promise<FriendshipRow> {
  const [row] = await db
    .insert(friendship)
    .values({
      requesterId,
      addresseeId,
      pairKey: pairKey(requesterId, addresseeId),
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("Failed to create friend request");
  return row;
}

export async function reopenRequest(
  id: string,
  requesterId: string,
  addresseeId: string,
): Promise<FriendshipRow> {
  const [row] = await db
    .update(friendship)
    .set({
      requesterId,
      addresseeId,
      status: "pending",
      respondedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(friendship.id, id))
    .returning();
  if (!row) throw new Error("Failed to reopen friend request");
  return row;
}

export async function setStatus(
  id: string,
  status: FriendStatus,
): Promise<FriendshipRow | null> {
  const [row] = await db
    .update(friendship)
    .set({ status, respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(friendship.id, id))
    .returning();
  return row ?? null;
}

export async function removeFriendship(a: string, b: string): Promise<void> {
  await db.delete(friendship).where(eq(friendship.pairKey, pairKey(a, b)));
}

const involvesUser = (userId: string) =>
  or(eq(friendship.requesterId, userId), eq(friendship.addresseeId, userId));

export async function listAllForUser(userId: string): Promise<FriendshipRow[]> {
  return db.select().from(friendship).where(involvesUser(userId));
}

export async function listAccepted(userId: string): Promise<FriendshipRow[]> {
  return db
    .select()
    .from(friendship)
    .where(and(eq(friendship.status, "accepted"), involvesUser(userId)))
    .orderBy(desc(friendship.updatedAt));
}

export async function listPendingIncoming(
  userId: string,
): Promise<FriendshipRow[]> {
  return db
    .select()
    .from(friendship)
    .where(
      and(eq(friendship.status, "pending"), eq(friendship.addresseeId, userId)),
    )
    .orderBy(desc(friendship.createdAt));
}

export async function listPendingOutgoing(
  userId: string,
): Promise<FriendshipRow[]> {
  return db
    .select()
    .from(friendship)
    .where(
      and(eq(friendship.status, "pending"), eq(friendship.requesterId, userId)),
    )
    .orderBy(desc(friendship.createdAt));
}

export async function acceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await listAccepted(userId);
  return rows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId,
  );
}

export function otherUserId(row: FriendshipRow, viewerId: string): string {
  return row.requesterId === viewerId ? row.addresseeId : row.requesterId;
}
