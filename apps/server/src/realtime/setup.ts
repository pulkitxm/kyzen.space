import { randomInt } from "node:crypto";
import type { GamePlayer } from "@kyzen/database";
import {
  type BotDifficulty,
  type GameDefinition,
  type GameEngine,
  isBotId,
  type LobbyConfig,
  lobbyConfigSchema,
  type Seat,
} from "@kyzen/shared/types";

const DEFAULT_LOBBY: LobbyConfig = { mode: "ffa", teams: {}, bots: [] };
const LOBBY_TEAMS = ["A", "B"] as const;

type Engine = GameEngine<unknown, unknown>;

function field(config: unknown, key: string): unknown {
  return typeof config === "object" && config !== null
    ? (config as Record<string, unknown>)[key]
    : undefined;
}

export function newSeed(): number {
  return randomInt(2 ** 31);
}

export function initialState(
  definition: GameDefinition,
  seats: Seat[],
  config: unknown,
): unknown {
  return definition.engine.createInitialState(seats, {
    config,
    seed: newSeed(),
  });
}

export function plainSeats(players: { role: string }[]): Seat[] {
  return players.map((player) => ({
    role: player.role,
    team: player.role,
    bot: null,
  }));
}

export function lobbySettings(config: unknown): LobbyConfig {
  const parsed = lobbyConfigSchema.safeParse({
    mode: field(config, "mode"),
    teams: field(config, "teams"),
    bots: field(config, "bots"),
  });
  return parsed.success ? parsed.data : DEFAULT_LOBBY;
}

function botUsername(difficulty: BotDifficulty): string {
  return `${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)} Bot`;
}

export function lobbySeats(
  engine: Engine,
  humans: GamePlayer[],
  lobby: LobbyConfig,
): { seats: Seat[]; bots: GamePlayer[] } {
  const entries = [
    ...humans.map((player) => ({
      id: player.userId,
      bot: null as BotDifficulty | null,
      team: lobby.teams[player.userId] ?? null,
    })),
    ...lobby.bots.map((bot) => ({
      id: bot.id,
      bot: bot.difficulty,
      team: bot.team as string | null,
    })),
  ];
  const counts = new Map<string, number>(LOBBY_TEAMS.map((team) => [team, 0]));
  for (const entry of entries)
    if (entry.team) counts.set(entry.team, (counts.get(entry.team) ?? 0) + 1);
  const seats = entries.map((entry, index): Seat => {
    const role = engine.roleForSeat(index);
    if (lobby.mode !== "teams") return { role, team: role, bot: entry.bot };
    let team = entry.team;
    if (!team) {
      team =
        (counts.get("A") ?? 0) <= (counts.get("B") ?? 0)
          ? LOBBY_TEAMS[0]
          : LOBBY_TEAMS[1];
      counts.set(team, (counts.get(team) ?? 0) + 1);
    }
    return { role, team, bot: entry.bot };
  });
  const bots = lobby.bots.map((bot, index) => ({
    userId: bot.id,
    username: botUsername(bot.difficulty),
    role: engine.roleForSeat(humans.length + index),
  }));
  return { seats, bots };
}

export function publicGroupSize(
  definition: GameDefinition,
  config: unknown,
): number | null {
  const { engine } = definition;
  if (engine.mode === "realtime" || !engine.reduce) return null;
  const size = engine.playerCount?.(config) ?? 2;
  return Number.isInteger(size) &&
    size >= Math.max(2, engine.minPlayers) &&
    size <= engine.maxPlayers
    ? size
    : null;
}

export function publicSeats(
  engine: Engine,
  groupSize: number,
  config: unknown,
): Seat[] {
  const teams = field(config, "mode") === "teams";
  return Array.from({ length: groupSize }, (_, index) => {
    const role = engine.roleForSeat(index);
    return {
      role,
      team: teams ? (LOBBY_TEAMS[index % 2] ?? role) : role,
      bot: null,
    };
  });
}

export function botDifficulty(
  config: unknown,
  userId: string,
): BotDifficulty | null {
  if (!isBotId(userId)) return null;
  return (
    lobbySettings(config).bots.find((bot) => bot.id === userId)?.difficulty ??
    "normal"
  );
}
