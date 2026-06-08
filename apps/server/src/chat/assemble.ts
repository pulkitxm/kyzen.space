import {
  type ConversationRow,
  conversations,
  type FriendshipRow,
  friends,
  type GamePlayer,
  games,
  type MessageRow,
  messages,
  type NotificationRow,
  profiles,
} from "@gamelobby/database";
import type {
  ConversationJson,
  FriendshipJson,
  GameCardMeta,
  MessageJson,
  NotificationJson,
} from "@gamelobby/shared/types";
import {
  serializeConversation,
  serializeFriendship,
  serializeMessage,
  serializeNotification,
} from "../api/serialize";
import { enrichGameCardMeta } from "./game-card";
import { computeSeriesScore } from "./series";

async function withGameCardStatus(
  msg: MessageJson,
  row: MessageRow,
): Promise<MessageJson> {
  if (msg.kind !== "game_card" || !row.gameId || !msg.metadata) return msg;
  const game = await games.getGameById(row.gameId);
  if (!game) return msg;
  const seriesGames = game.seriesId
    ? await games.getSeriesGames(game.seriesId)
    : [game];
  return {
    ...msg,
    gameId: game.code,
    metadata: enrichGameCardMeta(msg.metadata as GameCardMeta, {
      status: game.status,
      winner: game.winner,
      players: (game.players ?? []) as GamePlayer[],
      seriesScore: computeSeriesScore(seriesGames),
    }),
  };
}

export async function assembleMessage(row: MessageRow): Promise<MessageJson> {
  const sender = row.senderId
    ? await profiles.getPublicUser(row.senderId)
    : null;
  return withGameCardStatus(serializeMessage(row, sender), row);
}

export async function assembleMessages(
  rows: MessageRow[],
): Promise<MessageJson[]> {
  const ids = Array.from(
    new Set(rows.map((r) => r.senderId).filter((x): x is string => Boolean(x))),
  );
  const users = await profiles.getPublicUsers(ids);
  const byId = new Map(users.map((u) => [u.id, u]));
  return Promise.all(
    rows.map((r) =>
      withGameCardStatus(
        serializeMessage(r, r.senderId ? (byId.get(r.senderId) ?? null) : null),
        r,
      ),
    ),
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
