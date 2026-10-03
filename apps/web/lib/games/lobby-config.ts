import {
  type BotDifficulty,
  botId,
  isBotId,
  type LobbyConfig,
  lobbyConfigSchema,
  type TeamId,
} from "@kyzen/shared/types";

export type LobbyLimits = { minPlayers: number; maxPlayers: number };

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = [
  "easy",
  "normal",
  "hard",
];

const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

export function difficultyLabel(difficulty: BotDifficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}

export function readLobbyConfig(config: unknown): LobbyConfig {
  const { mode, teams, bots } = (config ?? {}) as Partial<LobbyConfig>;
  const parsed = lobbyConfigSchema.safeParse({ mode, teams, bots });
  return parsed.success ? parsed.data : { mode: "ffa", teams: {}, bots: [] };
}

export function lobbyConfigPayload(
  current: unknown,
  next: LobbyConfig,
): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? current
      : {};
  return { ...base, ...lobbyConfigSchema.parse(next) };
}

export function teamLetters(participants: number): TeamId[] {
  const count = Math.min(26, Math.max(2, participants));
  return Array.from({ length: count }, (_, index) =>
    String.fromCharCode(65 + index),
  );
}

export function lobbyTeams(
  config: LobbyConfig,
  humanIds: readonly string[],
): Map<string, TeamId> {
  const teams = new Map<string, TeamId>();
  const sizes = new Map<TeamId, number>();
  const assign = (id: string, team: TeamId) => {
    teams.set(id, team);
    sizes.set(team, (sizes.get(team) ?? 0) + 1);
  };
  for (const id of humanIds) {
    const team = config.teams[id];
    if (team) assign(id, team);
  }
  for (const bot of config.bots) assign(bot.id, bot.team);
  for (const id of humanIds) {
    if (!teams.has(id))
      assign(id, (sizes.get("B") ?? 0) < (sizes.get("A") ?? 0) ? "B" : "A");
  }
  return teams;
}

export function suggestedTeam(
  config: LobbyConfig,
  humanIds: readonly string[],
): TeamId {
  const teams = [...lobbyTeams(config, humanIds).values()];
  const size = (team: TeamId) => teams.filter((value) => value === team).length;
  return size("B") < size("A") ? "B" : "A";
}

function materializeTeams(
  config: LobbyConfig,
  humanIds: readonly string[],
): LobbyConfig {
  const teams = lobbyTeams(config, humanIds);
  return {
    ...config,
    teams: Object.fromEntries(humanIds.map((id) => [id, teams.get(id) ?? "A"])),
  };
}

export function withMode(
  config: LobbyConfig,
  mode: LobbyConfig["mode"],
  humanIds: readonly string[],
): LobbyConfig {
  return mode === "teams"
    ? { ...materializeTeams(config, humanIds), mode }
    : { ...config, mode };
}

export function assignTeam(
  config: LobbyConfig,
  participantId: string,
  team: TeamId,
  humanIds: readonly string[],
): LobbyConfig {
  const base = materializeTeams(config, humanIds);
  return isBotId(participantId)
    ? {
        ...base,
        bots: base.bots.map((bot) =>
          bot.id === participantId ? { ...bot, team } : bot,
        ),
      }
    : { ...base, teams: { ...base.teams, [participantId]: team } };
}

function nextBotId(config: LobbyConfig): string {
  const used = new Set(config.bots.map((bot) => bot.id));
  let index = 1;
  while (used.has(botId(index))) index += 1;
  return botId(index);
}

export function addBot(
  config: LobbyConfig,
  difficulty: BotDifficulty,
  team: TeamId,
): LobbyConfig {
  return {
    ...config,
    bots: [...config.bots, { id: nextBotId(config), difficulty, team }],
  };
}

export function removeBot(config: LobbyConfig, id: string): LobbyConfig {
  return { ...config, bots: config.bots.filter((bot) => bot.id !== id) };
}

export function setBotDifficulty(
  config: LobbyConfig,
  id: string,
  difficulty: BotDifficulty,
): LobbyConfig {
  return {
    ...config,
    bots: config.bots.map((bot) =>
      bot.id === id ? { ...bot, difficulty } : bot,
    ),
  };
}

export function startBlocker(
  config: LobbyConfig,
  humanIds: readonly string[],
  limits: LobbyLimits,
): string | null {
  const total = humanIds.length + config.bots.length;
  if (total < limits.minPlayers)
    return `Needs at least ${limits.minPlayers} players`;
  if (total > limits.maxPlayers)
    return `Allows at most ${limits.maxPlayers} players`;
  if (
    config.mode === "teams" &&
    new Set(lobbyTeams(config, humanIds).values()).size < 2
  )
    return "Teams mode needs at least two teams";
  return null;
}
