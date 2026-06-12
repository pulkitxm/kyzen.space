export type {
  ConversationMemberRow,
  ConversationRow,
  CreateGameInput,
  CreateMessageInput,
  CreateNotificationInput,
  CreateProfileInput,
  FriendshipRow,
  GamePlayer,
  GamePlayerRow,
  GameRecord,
  GameRow,
  GameStat,
  GameStatus,
  GameUpdate,
  MessageRow,
  MoveRow,
  NotificationRow,
  ProfileStats,
  PublicUserRow,
  SeatingMode,
  UserProfileRow,
} from "@gamelobby/shared/types";

import {
  createDb as createDbImpl,
  db as dbImpl,
  ping as pingImpl,
  schema as schemaImpl,
} from "./client";

export type { DB } from "./client";

export const createDb = createDbImpl;
export const db = dbImpl;
export const ping = pingImpl;
export const schema = schemaImpl;
export * as accountMerge from "./repositories/account-merge";
export * as conversations from "./repositories/conversations";
export * as friends from "./repositories/friends";
export * as games from "./repositories/games";
export * as messages from "./repositories/messages";
export * as notifications from "./repositories/notifications";
export * as profiles from "./repositories/profiles";
