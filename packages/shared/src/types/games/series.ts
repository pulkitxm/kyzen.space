import { z } from "zod";
import { avatarConfigSchema } from "../avatar";
import { gameTypeSchema } from "./core";
import { gameStatusSchema } from "./wire";

export const seriesScoreEntrySchema = z.object({
  userId: z.string(),
  username: z.string(),
  wins: z.number().int().nonnegative(),
  avatar: avatarConfigSchema.nullable().optional(),
});

export const seriesScoreSchema = z.object({
  entries: z.array(seriesScoreEntrySchema),
  draws: z.number().int().nonnegative(),
  completedGames: z.number().int().nonnegative(),
  totalGames: z.number().int().nonnegative(),
});

export const seriesGameSummarySchema = z.object({
  gameId: z.string(),
  gameNumber: z.number().int().positive(),
  status: gameStatusSchema,
  winner: z.string().nullable(),
  winnerUsername: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export const seriesDetailSchema = z.object({
  seriesId: z.string(),
  gameType: gameTypeSchema,
  score: seriesScoreSchema,
  games: z.array(seriesGameSummarySchema),
});

export type SeriesScoreEntry = z.infer<typeof seriesScoreEntrySchema>;
export type SeriesScore = z.infer<typeof seriesScoreSchema>;
export type SeriesGameSummary = z.infer<typeof seriesGameSummarySchema>;
export type SeriesDetail = z.infer<typeof seriesDetailSchema>;
