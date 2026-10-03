import type {
  ConversationMemberRow,
  ConversationRow,
  FriendshipRow,
  GameRecord,
  MessageRow,
  MoveRow,
  NotificationRow,
  PublicUserRow,
} from "@kyzen/database";
import {
  type ConversationJson,
  type FriendshipJson,
  type GameJson,
  type GameType,
  type MemberJson,
  type MessageJson,
  type MoveJson,
  type NotificationJson,
  type PublicUser,
  resolveWinnerUsername,
  type SeriesDetail,
  type SeriesScore,
} from "@kyzen/shared/types";

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

export function serializeSeries(
  seriesId: string,
  gameType: GameType,
  seriesGames: GameRecord[],
  score: SeriesScore,
): SeriesDetail {
  return {
    seriesId,
    gameType,
    score,
    games: seriesGames.map((g, i) => ({
      gameId: g.code,
      gameNumber: i + 1,
      status: g.status,
      winner: g.winner,
      winnerUsername: resolveWinnerUsername(g.winner, g.players, g.gameType),
      completedAt: iso(g.completedAt),
    })),
  };
}

export function publicPlayerId(
  row: GameRecord,
  userId: string | null,
): string | null {
  if (!row.publicMatch || !userId || userId === "draw") return userId;
  const player = row.players.find((player) => player.userId === userId);
  return player ? `${row.code}:${player.role}` : null;
}

export function serializeGame(row: GameRecord, viewerId?: string): GameJson {
  return {
    publicMatch: row.publicMatch ?? false,
    ...(viewerId ? { viewerId: publicPlayerId(row, viewerId) } : {}),
    id: row.code,
    gameType: row.gameType,
    status: row.status,
    winner: publicPlayerId(row, row.winner),
    players: row.publicMatch
      ? row.players.map((player, index) => ({
          userId: publicPlayerId(row, player.userId) ?? "",
          username: `Player ${index + 1}`,
          role: player.role,
          avatar: null,
        }))
      : row.players,
    gameState: row.gameState ?? null,
    conversationId: row.conversationId,
    creatorUserId: row.publicMatch ? null : row.creatorUserId,
    seatingMode: row.seatingMode,
    challengedUserId: row.publicMatch ? null : row.challengedUserId,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function serializeMove(
  row: MoveRow,
  gameCode: string,
  game?: GameRecord,
): MoveJson {
  return {
    id: row.id,
    gameId: gameCode,
    moveNumber: row.moveNumber,
    playerId: game ? (publicPlayerId(game, row.playerId) ?? "") : row.playerId,
    moveData: row.moveData,
    createdAt: iso(row.createdAt),
  };
}

export function serializePublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatar: row.avatar ?? null,
  };
}

export function serializeFriendship(
  row: FriendshipRow,
  viewerId: string,
  other: PublicUserRow,
): FriendshipJson {
  return {
    id: row.id,
    status: row.status,
    direction: row.requesterId === viewerId ? "outgoing" : "incoming",
    user: serializePublicUser(other),
    createdAt: iso(row.createdAt),
  };
}

export function serializeMember(
  member: ConversationMemberRow,
  pub: PublicUserRow,
): MemberJson {
  return { ...serializePublicUser(pub), role: member.role };
}

export function serializeMessage(
  row: MessageRow,
  sender: PublicUserRow | null,
): MessageJson {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: sender ? serializePublicUser(sender) : null,
    kind: row.kind,
    body: deleted ? null : row.body,
    metadata: deleted ? null : (row.metadata ?? null),
    gameId: row.gameId,
    createdAt: iso(row.createdAt),
    editedAt: iso(row.editedAt),
    deletedAt: iso(row.deletedAt),
  };
}

export function serializeConversation(
  row: ConversationRow,
  opts: {
    viewerId: string;
    members: { member: ConversationMemberRow; user: PublicUserRow }[];
    lastMessage: MessageJson | null;
    unreadCount: number;
  },
): ConversationJson {
  let name = row.name;
  if (row.kind === "dm") {
    const other = opts.members.find((m) => m.user.id !== opts.viewerId);
    name = other ? (other.user.displayName ?? other.user.username) : null;
  }
  return {
    id: row.id,
    kind: row.kind,
    name,
    avatarUrl: row.avatarUrl,
    members: opts.members.map((m) => serializeMember(m.member, m.user)),
    lastMessage: opts.lastMessage,
    unreadCount: opts.unreadCount,
    lastMessageAt: iso(row.lastMessageAt),
    createdAt: iso(row.createdAt),
  };
}

export function serializeNotification(
  row: NotificationRow,
  actor: PublicUserRow | null,
): NotificationJson {
  return {
    id: row.id,
    type: row.type,
    actor: actor ? serializePublicUser(actor) : null,
    payload: row.payload ?? {},
    read: Boolean(row.readAt),
    createdAt: iso(row.createdAt),
  };
}
