import { z } from "zod";
import { GAME_TYPES } from "../../constants/games";

export const gameTypeSchema = z.enum(GAME_TYPES);
export type GameType = z.infer<typeof gameTypeSchema>;
