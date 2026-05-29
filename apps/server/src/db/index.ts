export { db, schema, type DB } from "./client";
export * as games from "./repositories/games";
export * as profiles from "./repositories/profiles";
export type {
  GameRow,
  MoveRow,
  UserProfileRow,
  GamePlayer,
  GameStatus,
  GameStat,
  ProfileStats,
} from "./schema";
