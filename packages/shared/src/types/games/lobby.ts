import { z } from "zod";

export const BOT_ID_PREFIX = "bot:";

export function isBotId(id: string): boolean {
  return id.startsWith(BOT_ID_PREFIX);
}

export function botId(index: number): string {
  return `${BOT_ID_PREFIX}${index}`;
}

export const botDifficultySchema = z.enum(["easy", "normal", "hard"]);

export const teamIdSchema = z.string().regex(/^[A-Z]$/);
export type TeamId = z.infer<typeof teamIdSchema>;

export const lobbyBotSchema = z
  .object({
    id: z.string().regex(/^bot:\d+$/),
    difficulty: botDifficultySchema,
    team: teamIdSchema,
  })
  .strict();
export type LobbyBot = z.infer<typeof lobbyBotSchema>;

export const lobbyConfigSchema = z
  .object({
    mode: z.enum(["ffa", "teams"]).default("ffa"),
    teams: z.record(z.string().min(1), teamIdSchema).default({}),
    bots: z.array(lobbyBotSchema).default([]),
  })
  .strict()
  .refine(
    (config) =>
      new Set(config.bots.map((bot) => bot.id)).size === config.bots.length,
    "Bot ids must be unique",
  );
export type LobbyConfig = z.infer<typeof lobbyConfigSchema>;
