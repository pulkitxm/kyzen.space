import type {
  ConversationJson,
  FriendshipJson,
  MemberJson,
  MessageJson,
  NotificationJson,
  PublicUser,
} from "@gamelobby/chat-core";
import type { GameJson, MoveJson } from "@gamelobby/games-core";
import type {
  ConversationMemberRow,
  ConversationRow,
  FriendshipRow,
  GamePlayer,
  GameRow,
  MessageRow,
  MoveRow,
  NotificationRow,
} from "../db";
import type { PublicUserRow } from "../db/repositories/profiles";

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

export function serializeGame(row: GameRow): GameJson {
  return {
    id: row.id,
    gameType: row.gameType,
    status: row.status,
    winner: row.winner,
    players: (row.players ?? []) as GamePlayer[],
    gameState: row.gameState ?? null,
    conversationId: row.conversationId,
    creatorUserId: row.creatorUserId,
    seatingMode: row.seatingMode,
    challengedUserId: row.challengedUserId,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function serializeMove(row: MoveRow): MoveJson {
  return {
    id: row.id,
    gameId: row.gameId,
    moveNumber: row.moveNumber,
    playerId: row.playerId,
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
