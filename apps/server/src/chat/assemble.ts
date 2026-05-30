import type {
  ConversationJson,
  FriendshipJson,
  MessageJson,
  NotificationJson,
} from "@gamelobby/chat-core";
import {
  serializeConversation,
  serializeFriendship,
  serializeMessage,
  serializeNotification,
} from "../api/serialize";
import {
  type ConversationRow,
  conversations,
  type FriendshipRow,
  friends,
  type MessageRow,
  messages,
  type NotificationRow,
  profiles,
} from "../db";

// Hydrate DB rows into client DTOs (resolving the related public users).

export async function assembleMessage(row: MessageRow): Promise<MessageJson> {
  const sender = row.senderId
    ? await profiles.getPublicUser(row.senderId)
    : null;
  return serializeMessage(row, sender);
}

export async function assembleMessages(
  rows: MessageRow[],
): Promise<MessageJson[]> {
  const ids = Array.from(
    new Set(rows.map((r) => r.senderId).filter((x): x is string => Boolean(x))),
  );
  const users = await profiles.getPublicUsers(ids);
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) =>
    serializeMessage(r, r.senderId ? (byId.get(r.senderId) ?? null) : null),
  );
}

export async function assembleConversation(
  row: ConversationRow,
  viewerId: string,
): Promise<ConversationJson> {
  const memberRows = await conversations.getMemberRows(row.id);
  const users = await profiles.getPublicUsers(memberRows.map((m) => m.userId));
  const byId = new Map(users.map((u) => [u.id, u]));
  const members = memberRows.flatMap((member) => {
    const user = byId.get(member.userId);
    return user ? [{ member, user }] : [];
  });

  let lastMessage: MessageJson | null = null;
  if (row.lastMessageId) {
    const msg = await messages.getById(row.lastMessageId);
    if (msg) lastMessage = await assembleMessage(msg);
  }
  const unreadCount = await conversations.unreadCount(row.id, viewerId);

  return serializeConversation(row, {
    viewerId,
    members,
    lastMessage,
    unreadCount,
  });
}

export async function assembleConversations(
  rows: ConversationRow[],
  viewerId: string,
): Promise<ConversationJson[]> {
  return Promise.all(rows.map((r) => assembleConversation(r, viewerId)));
}

export async function assembleFriendship(
  row: FriendshipRow,
  viewerId: string,
): Promise<FriendshipJson | null> {
  const otherId = friends.otherUserId(row, viewerId);
  const other = await profiles.getPublicUser(otherId);
  if (!other) return null;
  return serializeFriendship(row, viewerId, other);
}

export async function assembleFriendships(
  rows: FriendshipRow[],
  viewerId: string,
): Promise<FriendshipJson[]> {
  const otherIds = Array.from(
    new Set(rows.map((r) => friends.otherUserId(r, viewerId))),
  );
  const users = await profiles.getPublicUsers(otherIds);
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.flatMap((row) => {
    const other = byId.get(friends.otherUserId(row, viewerId));
    return other ? [serializeFriendship(row, viewerId, other)] : [];
  });
}

export async function assembleNotification(
  row: NotificationRow,
): Promise<NotificationJson> {
  const actor = row.actorId ? await profiles.getPublicUser(row.actorId) : null;
  return serializeNotification(row, actor);
}
