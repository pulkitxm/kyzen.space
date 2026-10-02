import type {
  ConversationMemberRow,
  ConversationRow,
  MemberRole,
} from "@kyzen/shared/types";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../client";
import { conversation, conversationMember, message } from "../schema";

export function dmKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export async function getById(id: string): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, id))
    .limit(1);
  return row ?? null;
}

export async function findDm(
  a: string,
  b: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.dmKey, dmKey(a, b)))
    .limit(1);
  return row ?? null;
}

export async function getOrCreateDm(
  a: string,
  b: string,
): Promise<{ conversation: ConversationRow; created: boolean }> {
  const key = dmKey(a, b);
  const [existing] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.dmKey, key))
    .limit(1);
  if (existing) return { conversation: existing, created: false };

  return db.transaction(async (tx) => {
    const [again] = await tx
      .select()
      .from(conversation)
      .where(eq(conversation.dmKey, key))
      .limit(1);
    if (again) return { conversation: again, created: false };

    const [conv] = await tx
      .insert(conversation)
      .values({ kind: "dm", dmKey: key, createdBy: a })
      .returning();
    if (!conv) throw new Error("Failed to create conversation");
    await tx.insert(conversationMember).values([
      { conversationId: conv.id, userId: a, role: "member" },
      { conversationId: conv.id, userId: b, role: "member" },
    ]);
    return { conversation: conv, created: true };
  });
}

export async function createGroup(input: {
  createdBy: string;
  name: string;
  memberIds: string[];
}): Promise<ConversationRow> {
  const members = Array.from(new Set([input.createdBy, ...input.memberIds]));
  return db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversation)
      .values({ kind: "group", name: input.name, createdBy: input.createdBy })
      .returning();
    if (!conv) throw new Error("Failed to create conversation");
    await tx.insert(conversationMember).values(
      members.map((userId) => ({
        conversationId: conv.id,
        userId,
        role: (userId === input.createdBy ? "owner" : "member") as MemberRole,
      })),
    );
    return conv;
  });
}

export async function findGroupByName(
  name: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.kind, "group"), eq(conversation.name, name)))
    .limit(1);
  return row ?? null;
}

export async function isMember(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationMember.id })
    .from(conversationMember)
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
        isNull(conversationMember.leftAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function getMemberRole(
  conversationId: string,
  userId: string,
): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: conversationMember.role })
    .from(conversationMember)
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
        isNull(conversationMember.leftAt),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

export async function getMemberRows(
  conversationId: string,
): Promise<ConversationMemberRow[]> {
  return db
    .select()
    .from(conversationMember)
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        isNull(conversationMember.leftAt),
      ),
    );
}

export async function getMemberIds(conversationId: string): Promise<string[]> {
  const rows = await getMemberRows(conversationId);
  return rows.map((r) => r.userId);
}

export async function getConversationIdsForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ conversationId: conversationMember.conversationId })
    .from(conversationMember)
    .where(
      and(
        eq(conversationMember.userId, userId),
        isNull(conversationMember.leftAt),
      ),
    );
  return rows.map((r) => r.conversationId);
}

export async function listForUser(userId: string): Promise<ConversationRow[]> {
  const ids = await getConversationIdsForUser(userId);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(conversation)
    .where(inArray(conversation.id, ids))
    .orderBy(sql`${conversation.lastMessageAt} desc nulls last`);
}

export async function addMembers(
  conversationId: string,
  userIds: string[],
): Promise<void> {
  for (const userId of userIds) {
    await db
      .insert(conversationMember)
      .values({ conversationId, userId, role: "member" })
      .onConflictDoUpdate({
        target: [conversationMember.conversationId, conversationMember.userId],
        set: { leftAt: null },
      });
  }
}

export async function removeMember(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .update(conversationMember)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
      ),
    );
}

export async function renameGroup(
  conversationId: string,
  name: string,
): Promise<ConversationRow> {
  const [row] = await db
    .update(conversation)
    .set({ name, updatedAt: new Date() })
    .where(eq(conversation.id, conversationId))
    .returning();
  if (!row) throw new Error("Failed to rename conversation");
  return row;
}

export async function touchLastMessage(
  conversationId: string,
  messageId: string,
  at: Date,
): Promise<void> {
  await db
    .update(conversation)
    .set({ lastMessageId: messageId, lastMessageAt: at, updatedAt: new Date() })
    .where(eq(conversation.id, conversationId));
}

export async function markRead(
  conversationId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  await db
    .update(conversationMember)
    .set({
      lastReadMessageId: messageId,
      lastReadAt: sql`(select created_at from message where id = ${messageId} and conversation_id = ${conversationId})`,
    })
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
      ),
    );
}

export async function unreadCount(
  conversationId: string,
  userId: string,
): Promise<number> {
  const [member] = await db
    .select({
      lastReadMessageId: conversationMember.lastReadMessageId,
      leftAt: conversationMember.leftAt,
    })
    .from(conversationMember)
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
      ),
    )
    .limit(1);

  if (!member || member.leftAt) return 0;

  const conds = [
    eq(message.conversationId, conversationId),
    isNull(message.deletedAt),
    ne(message.senderId, userId),
  ];
  if (member.lastReadMessageId)
    conds.push(
      sql`(${message.createdAt}, ${message.id}) > (select created_at, id from message where id = ${member.lastReadMessageId} and conversation_id = ${conversationId})`,
    );

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .where(and(...conds));
  return row?.count ?? 0;
}
