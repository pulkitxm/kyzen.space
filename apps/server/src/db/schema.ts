import type { AvatarConfig } from "@gamelobby/avatar";
import type {
  ConversationKind,
  FriendStatus,
  MemberRole,
  MessageKind,
  MessageMetadata,
  NotificationPayload,
  NotificationType,
} from "@gamelobby/chat-core";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { ChatMode } from "../lib/chat-layout";
import { DEFAULT_PATTERN, PATTERN_IDS } from "../lib/pattern";
import {
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  THEME_IDS,
} from "../lib/theme";

export const themeEnum = pgEnum("app_theme", THEME_IDS);
export const colorModeEnum = pgEnum("color_mode", COLOR_MODES);
export const patternEnum = pgEnum("app_pattern", PATTERN_IDS);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

export type GamePlayer = { userId: string; username: string; role: string };

export type GameStatus = "waiting" | "active" | "completed" | "abandoned";

/** How a seat is claimed in a chat-created game. */
export type SeatingMode = "open" | "challenge";

export const game = pgTable(
  "game",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameType: text("game_type").notNull(),
    status: text("status").$type<GameStatus>().notNull().default("waiting"),
    winner: text("winner"),
    gameState: jsonb("game_state").$type<unknown>(),
    // Opaque per-game setup, validated against the game's `configSchema`.
    config: jsonb("config").$type<unknown>(),
    // Phase 3 — game-in-chat link columns (all nullable; legacy games have none).
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    creatorUserId: text("creator_user_id"),
    seatingMode: text("seating_mode").$type<SeatingMode>(),
    challengedUserId: text("challenged_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("game_conversation_idx").on(t.conversationId)],
);

export const move = pgTable(
  "move",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    moveNumber: integer("move_number").notNull(),
    playerId: text("player_id").notNull(),
    moveData: jsonb("move_data").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("move_game_number_uq").on(t.gameId, t.moveNumber)],
);

// One row per seated player. Normalizes the former `game.players` JSONB array so
// "my games" and "who's in this game" are indexed joins instead of a containment
// scan, and leaves room for per-seat data (result, rating) later. `username` is
// denormalized (matching the old card behavior) so a card resolves without a
// profile join. `seatOrder` is the engine role index (0 → roles[0], …).
export const gamePlayer = pgTable(
  "game_player",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    role: text("role").notNull(),
    seatOrder: integer("seat_order").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [
    unique("game_player_uq").on(t.gameId, t.userId),
    index("game_player_user_idx").on(t.userId),
  ],
);

export type GameStat = {
  played: number;
  won: number;
  lost: number;
  drawn: number;
};
export type ProfileStats = Record<string, GameStat>;

export const userProfile = pgTable("user_profile", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  stats: jsonb("stats").$type<ProfileStats>().notNull().default({}),
  avatar: jsonb("avatar").$type<AvatarConfig | null>(),
  theme: themeEnum("theme").notNull().default(DEFAULT_THEME),
  colorMode: colorModeEnum("color_mode").notNull().default(DEFAULT_COLOR_MODE),
  pattern: patternEnum("pattern").notNull().default(DEFAULT_PATTERN),
  chatLayout: jsonb("chat_layout").$type<{ mode: ChatMode } | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GameRow = typeof game.$inferSelect;
export type MoveRow = typeof move.$inferSelect;
export type GamePlayerRow = typeof gamePlayer.$inferSelect;
export type UserProfileRow = typeof userProfile.$inferSelect;

// ---------------------------------------------------------------------------
// Friends + chat (plaintext messages; no encryption)
// ---------------------------------------------------------------------------

// One row per unordered user pair. `pairKey` = sorted(a,b).join(":"), computed
// in the repo, so a single UNIQUE prevents A->B and B->A duplicate requests.
export const friendship = pgTable(
  "friendship",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pairKey: text("pair_key").notNull(),
    status: text("status").$type<FriendStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (t) => [
    unique("friendship_pair_uq").on(t.pairKey),
    index("friendship_addressee_status_idx").on(t.addresseeId, t.status),
    index("friendship_requester_status_idx").on(t.requesterId, t.status),
  ],
);

// DM or group container. For DMs, `dmKey` = sorted(a,b).join(":") dedupes the
// pair (Postgres treats multiple NULLs as distinct, so groups — dmKey NULL —
// are unaffected by the UNIQUE). `lastMessageId` is a denormalized cache, not a FK.
export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").$type<ConversationKind>().notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    dmKey: text("dm_key").unique(),
    lastMessageId: uuid("last_message_id"),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("conversation_last_message_at_idx").on(t.lastMessageAt)],
);

// Membership + per-member read state. `leftAt` soft-leave keeps group history's
// sender resolvable after someone leaves. `lastReadMessageId` is a cache pointer (no FK).
export const conversationMember = pgTable(
  "conversation_member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    lastReadMessageId: uuid("last_read_message_id"),
    lastReadAt: timestamp("last_read_at"),
    muted: boolean("muted").notNull().default(false),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (t) => [
    unique("conversation_member_uq").on(t.conversationId, t.userId),
    index("conversation_member_user_idx").on(t.userId),
  ],
);

// All message kinds, stored PLAINTEXT. `body` for text/system; `metadata` for
// gif/game_card/system; `gameId` set for game_card. Soft delete via `deletedAt`.
// Paginate by (conversationId, createdAt) — never by the non-monotonic uuid id.
export const message = pgTable(
  "message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    senderId: text("sender_id").references(() => user.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<MessageKind>().notNull().default("text"),
    body: text("body"),
    metadata: jsonb("metadata").$type<MessageMetadata>(),
    gameId: uuid("game_id").references(() => game.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("message_conv_created_idx").on(t.conversationId, t.createdAt),
    index("message_game_idx").on(t.gameId),
  ],
);

// Per-recipient, persisted (so offline users get them on next load) + pushed realtime.
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload")
      .$type<NotificationPayload>()
      .notNull()
      .default({}),
    readAt: timestamp("read_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notification_user_created_idx").on(t.userId, t.createdAt),
    index("notification_user_unread_idx").on(t.userId, t.readAt),
  ],
);

export type FriendshipRow = typeof friendship.$inferSelect;
export type ConversationRow = typeof conversation.$inferSelect;
export type ConversationMemberRow = typeof conversationMember.$inferSelect;
export type MessageRow = typeof message.$inferSelect;
export type NotificationRow = typeof notification.$inferSelect;
