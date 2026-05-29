export { type DB, db, schema } from "./client";
export * as games from "./repositories/games";
export * as profiles from "./repositories/profiles";
export type {
  GamePlayer,
  GameRow,
  GameStat,
  GameStatus,
  MoveRow,
  ProfileStats,
  UserProfileRow,
} from "./schema";
