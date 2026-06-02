import type {
  NotificationPayload,
  NotificationType,
} from "@gamelobby/chat-core";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../client";
import { type NotificationRow, notification } from "../schema";
import { decodeCursor, encodeCursor } from "./cursor";

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  payload?: NotificationPayload;
};

export async function create(
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const [row] = await db
    .insert(notification)
    .values({
      userId: input.userId,
      type: input.type,
      actorId: input.actorId ?? null,
      payload: input.payload ?? {},
    })
    .returning();
  return row!;
}

export async function getById(id: string): Promise<NotificationRow | null> {
  const [row] = await db
    .select()
    .from(notification)
    .where(eq(notification.id, id))
    .limit(1);
  return row ?? null;
}

export async function listForUser(
  userId: string,
  opts: { cursor?: string; limit?: number; unreadOnly?: boolean } = {},
): Promise<{ notifications: NotificationRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const conds = [eq(notification.userId, userId)];
  if (opts.unreadOnly) conds.push(isNull(notification.readAt));

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      conds.push(
        or(
          lt(notification.createdAt, c.createdAt),
          and(
            eq(notification.createdAt, c.createdAt),
            lt(notification.id, c.id),
          ),
        )!,
      );
    }
  }

  const rows = await db
    .select()
    .from(notification)
    .where(and(...conds))
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last?.createdAt ? encodeCursor(last.createdAt, last.id) : null;
  return { notifications: page, nextCursor };
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.count ?? 0;
}

export async function markRead(
  id: string,
  userId: string,
): Promise<NotificationRow | null> {
  const [row] = await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.id, id),
        eq(notification.userId, userId),
        isNull(notification.readAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

export async function resolveByRequestId(
  userId: string,
  type: NotificationType,
  requestId: string,
): Promise<void> {
  await db
    .update(notification)
    .set({
      resolvedAt: new Date(),
      readAt: sql`coalesce(${notification.readAt}, now())`,
    })
    .where(
      and(
        eq(notification.userId, userId),
        eq(notification.type, type),
        isNull(notification.resolvedAt),
        sql`${notification.payload} ->> 'requestId' = ${requestId}`,
      ),
    );
}
