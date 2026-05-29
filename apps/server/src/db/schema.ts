import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ─────────────────────────────────────────────────────────────
 * Better Auth core tables (singular names, camelCase fields).
 * Shapes match Better Auth's expected Drizzle schema.
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Application tables. game_state / players / stats use jsonb so the
 * schema stays game-agnostic — new games need no migration.
 * ───────────────────────────────────────────────────────────── */

/** A player seated in a game. */
export type GamePlayer = { userId: string; username: string; role: string };

export type GameStatus = "waiting" | "active" | "completed" | "abandoned";

export const game = pgTable("game", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameType: text("game_type").notNull(),
  status: text("status").$type<GameStatus>().notNull().default("waiting"),
  players: jsonb("players").$type<GamePlayer[]>().notNull().default([]),
  winner: text("winner"),
  gameState: jsonb("game_state").$type<unknown>(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

/** Per-game-type stats: { played, won, lost, drawn }. */
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GameRow = typeof game.$inferSelect;
export type MoveRow = typeof move.$inferSelect;
export type UserProfileRow = typeof userProfile.$inferSelect;
