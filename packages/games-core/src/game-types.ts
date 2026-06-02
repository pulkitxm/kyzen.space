import { z } from "zod";

export const TIC_TAC_TOE = "tic-tac-toe";

export const GAME_TYPES = [TIC_TAC_TOE] as const;

export type GameType = (typeof GAME_TYPES)[number];

export const gameTypeSchema = z.enum(GAME_TYPES);
