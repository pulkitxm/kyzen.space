import type { AvatarConfig } from "@gamelobby/avatar";
import type {
  ConversationKind,
  FriendStatus,
  MemberRole,
  MessageKind,
  MessageMetadata,
  NotificationPayload,
  NotificationType,
} from "../chat/dto";
import type { ChatMode } from "../chat-layout";
import type { GameType } from "../games/core";
import type { GameStatusDto, SeatingModeDto } from "../games/wire";
import type { GlassMode } from "../glass";
import type { PatternId } from "../pattern";
import type { ColorMode, ThemeId } from "../theme";

export * from "./io";

export type GamePlayer = {
  userId: string;
  username: string;
  role: string;
  avatar?: AvatarConfig | null;
};

export type GameStatus = GameStatusDto;

export type SeatingMode = SeatingModeDto;

export type GameStat = {
  played: number;
  won: number;
  lost: number;
  drawn: number;
};

export type ProfileStats = Record<string, GameStat>;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountMergeStatus = "pending" | "confirmed" | "discarded";

export type AccountMergeRow = {
  id: string;
  anonUserId: string;
  targetUserId: string;
  status: AccountMergeStatus;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type SessionRow = {
  id: string;
  expiresAt: Date;
  token: string;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
};

export type AccountRow = {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VerificationRow = {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type GameRow = {
  id: string;
  code: string;
  gameType: string;
  status: GameStatus;
  winner: string | null;
  gameState: unknown;
  config: unknown;
  conversationId: string | null;
  creatorUserId: string | null;
  seatingMode: SeatingMode | null;
  challengedUserId: string | null;
  seriesId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MoveRow = {
  id: string;
  gameId: string;
  moveNumber: number;
  playerId: string;
  moveData: unknown;
  createdAt: Date;
};

export type GamePlayerRow = {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  role: string;
  seatOrder: number;
  joinedAt: Date;
};

export type UserProfileRow = {
  id: string;
  userId: string;
  username: string;
  stats: ProfileStats;
  avatar: AvatarConfig | null;
  theme: ThemeId;
  colorMode: ColorMode;
  pattern: PatternId;
  glass: GlassMode;
  chatLayout: { mode: ChatMode } | null;
  usernameChangedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FriendshipRow = {
  id: string;
  requesterId: string;
  addresseeId: string;
  pairKey: string;
  status: FriendStatus;
  createdAt: Date;
  updatedAt: Date;
  respondedAt: Date | null;
};

export type ConversationRow = {
  id: string;
  kind: ConversationKind;
  name: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  dmKey: string | null;
  lastMessageId: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ConversationMemberRow = {
  id: string;
  conversationId: string;
  userId: string;
  role: MemberRole;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
  muted: boolean;
  joinedAt: Date;
  leftAt: Date | null;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string | null;
  metadata: MessageMetadata | null;
  gameId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export type NotificationRow = {
  id: string;
  userId: string;
  type: NotificationType;
  actorId: string | null;
  payload: NotificationPayload;
  readAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

export type GameInviteRow = {
  id: string;
  token: string;
  inviterUserId: string;
  gameType: string;
  config: unknown;
  seatingMode: SeatingMode | null;
  expiresAt: Date;
  createdAt: Date;
};

export type GameRecord = Omit<GameRow, "gameType"> & {
  gameType: GameType;
  players: GamePlayer[];
};

export type CreateGameInput = {
  gameType: GameType;
  players: GamePlayer[];
  gameState: unknown;
  config?: unknown;
  status?: GameStatus;
  conversationId?: string | null;
  creatorUserId?: string | null;
  seatingMode?: SeatingMode | null;
  challengedUserId?: string | null;
  seriesId?: string | null;
};

export type GameUpdate = Partial<
  Pick<GameRow, "status" | "winner" | "gameState" | "startedAt" | "completedAt">
>;

export type CreateMessageInput = {
  conversationId: string;
  senderId: string | null;
  kind?: MessageKind;
  body?: string | null;
  metadata?: MessageMetadata | null;
  gameId?: string | null;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  payload?: NotificationPayload;
};

export type CreateProfileInput = {
  userId: string;
  username: string;
  avatar?: AvatarConfig | null;
};

export type CreateGameInviteInput = {
  inviterUserId: string;
  gameType: GameType;
  token: string;
  config?: unknown;
  seatingMode?: SeatingMode | null;
  expiresAt: Date;
};

export type PublicUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
};
