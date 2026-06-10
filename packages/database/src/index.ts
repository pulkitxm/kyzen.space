export type {
  ConversationMemberRow,
  ConversationRow,
  CreateGameInput,
  CreateGameInviteInput,
  CreateMessageInput,
  CreateNotificationInput,
  CreateProfileInput,
  FriendshipRow,
  GameInviteRow,
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
import { generateInviteToken as generateInviteTokenImpl } from "./invite-token";

export type { DB } from "./client";

export const createDb = createDbImpl;
export const db = dbImpl;
export const ping = pingImpl;
export const schema = schemaImpl;
export const generateInviteToken = generateInviteTokenImpl;
export * as accountMerge from "./repositories/account-merge";
export * as conversations from "./repositories/conversations";
export * as friends from "./repositories/friends";
export * as games from "./repositories/games";
export * as invites from "./repositories/invites";
export * as messages from "./repositories/messages";
export * as notifications from "./repositories/notifications";
export * as profiles from "./repositories/profiles";
