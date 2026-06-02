import type { MessageKind, MessageMetadata } from "@gamelobby/chat-core";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../client";
import { type MessageRow, message } from "../schema";
import { decodeCursor, encodeCursor } from "./cursor";

export type CreateMessageInput = {
  conversationId: string;
  senderId: string | null;
  kind?: MessageKind;
  body?: string | null;
  metadata?: MessageMetadata | null;
  gameId?: string | null;
};

export async function insertMessage(
  input: CreateMessageInput,
): Promise<MessageRow> {
  const [row] = await db
    .insert(message)
    .values({
      conversationId: input.conversationId,
      senderId: input.senderId,
      kind: input.kind ?? "text",
      body: input.body ?? null,
      metadata: input.metadata ?? null,
      gameId: input.gameId ?? null,
    })
    .returning();
  return row!;
}

export async function getById(id: string): Promise<MessageRow | null> {
  const [row] = await db
    .select()
    .from(message)
    .where(eq(message.id, id))
    .limit(1);
  return row ?? null;
}

export async function getByIds(ids: string[]): Promise<MessageRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(message).where(inArray(message.id, ids));
}

export async function getGameCardByGameId(
  gameId: string,
): Promise<MessageRow | null> {
  const [row] = await db
    .select()
    .from(message)
    .where(and(eq(message.gameId, gameId), eq(message.kind, "game_card")))
    .limit(1);
  return row ?? null;
}

export async function listMessages(
  conversationId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ messages: MessageRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const conds = [eq(message.conversationId, conversationId)];

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      conds.push(
        or(
          lt(message.createdAt, c.createdAt),
          and(eq(message.createdAt, c.createdAt), lt(message.id, c.id)),
        )!,
      );
    }
  }

  const rows = await db
    .select()
    .from(message)
    .where(and(...conds))
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last?.createdAt ? encodeCursor(last.createdAt, last.id) : null;
  return { messages: page, nextCursor };
}

export async function softDelete(id: string): Promise<MessageRow | null> {
  const [row] = await db
    .update(message)
    .set({ deletedAt: new Date() })
    .where(eq(message.id, id))
    .returning();
  return row ?? null;
}
