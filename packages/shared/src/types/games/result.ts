import type { AvatarConfig } from "../avatar";
import type { SeriesDetail, SeriesScore } from "./series";
import type { GameJson } from "./wire";
import { isGameOver } from "./wire";

export type MatchFormat = "single" | "bestOf" | "fixedRounds";

export type MatchConfig = {
  format: MatchFormat;
  totalRounds?: number;
  winsNeeded?: number;
};

export type GameResultPhase =
  | "roundComplete"
  | "seriesComplete"
  | "matchComplete";

export type GameResultOutcome =
  | "win"
  | "loss"
  | "draw"
  | "spectator"
  | "abandoned"
  | "aborted";

export type GameResultPrimaryAction = "nextRound" | "rematch" | "none";

export type PlayerSessionStats = {
  userId: string;
  username: string;
  avatar?: AvatarConfig | null;
  played: number;
  wins: number;
  losses: number;
};

export type GameResultPlayer = {
  userId: string;
  username: string;
  avatar?: AvatarConfig | null;
  isRoundWinner: boolean;
  isSeriesWinner: boolean;
};

export type GameResultViewModel = {
  phase: GameResultPhase;
  headline: string;
  subheadline: string | null;
  roundLabel: string | null;
  outcome: GameResultOutcome;
  isDraw: boolean;
  roundWinnerId: string | null;
  seriesWinnerId: string | null;
  players: GameResultPlayer[];
  sessionStats: PlayerSessionStats[];
  roundProgress: { current: number; total: number | null } | null;
  seriesLabel: string | null;
  primaryAction: GameResultPrimaryAction;
  showSeriesHistory: boolean;
  canContinue: boolean;
};

export function resolveMatchConfig(config: unknown): MatchConfig {
  if (!config || typeof config !== "object") {
    return { format: "single" };
  }
  const record = config as Record<string, unknown>;
  const bestOf = record.bestOf;
  if (typeof bestOf === "number" && Number.isInteger(bestOf) && bestOf >= 1) {
    return {
      format: "bestOf",
      totalRounds: bestOf,
      winsNeeded: Math.ceil(bestOf / 2),
    };
  }
  const rounds = record.rounds;
  if (typeof rounds === "number" && Number.isInteger(rounds) && rounds >= 1) {
    return { format: "fixedRounds", totalRounds: rounds };
  }
  return { format: "single" };
}

function winsForUser(score: SeriesScore | null, userId: string): number {
  return score?.entries.find((entry) => entry.userId === userId)?.wins ?? 0;
}

function buildSessionStats(
  game: GameJson,
  series: SeriesDetail | null,
): PlayerSessionStats[] {
  const score = series?.score ?? null;
  const completedGames =
    score?.completedGames ?? (game.status === "completed" ? 1 : 0);

  return game.players.map((player) => {
    const wins =
      score != null
        ? winsForUser(score, player.userId)
        : game.winner === player.userId
          ? 1
          : 0;

    let losses = 0;
    if (game.players.length === 2) {
      const opponent = game.players.find((p) => p.userId !== player.userId);
      losses =
        score != null && opponent
          ? winsForUser(score, opponent.userId)
          : game.winner &&
              game.winner !== "draw" &&
              game.winner !== player.userId
            ? 1
            : 0;
    } else if (score != null) {
      losses = Math.max(0, completedGames - wins);
    }

    return {
      userId: player.userId,
      username: player.username,
      avatar: player.avatar ?? null,
      played: completedGames,
      wins,
      losses,
    };
  });
}

function detectSeriesState(
  matchConfig: MatchConfig,
  stats: PlayerSessionStats[],
  completedGames: number,
): { complete: boolean; seriesWinnerId: string | null } {
  if (matchConfig.format === "single") {
    return { complete: true, seriesWinnerId: null };
  }

  const winsNeeded = matchConfig.winsNeeded ?? 1;
  const maxRounds = matchConfig.totalRounds ?? winsNeeded * 2 - 1;
  const leaderWins = Math.max(0, ...stats.map((entry) => entry.wins));
  const leaders = stats.filter((entry) => entry.wins === leaderWins);

  if (matchConfig.format === "bestOf") {
    const champion = stats.find((entry) => entry.wins >= winsNeeded);
    if (champion) {
      return { complete: true, seriesWinnerId: champion.userId };
    }
    if (completedGames >= maxRounds) {
      if (leaders.length === 1 && leaderWins > 0) {
        return { complete: true, seriesWinnerId: leaders[0]?.userId ?? null };
      }
      return { complete: true, seriesWinnerId: null };
    }
    return { complete: false, seriesWinnerId: null };
  }

  if (completedGames >= (matchConfig.totalRounds ?? 1)) {
    if (leaders.length === 1 && leaderWins > 0) {
      return { complete: true, seriesWinnerId: leaders[0]?.userId ?? null };
    }
    return { complete: true, seriesWinnerId: null };
  }

  return { complete: false, seriesWinnerId: null };
}

function resolveOutcome(
  game: GameJson,
  userId: string,
  isPlayer: boolean,
): GameResultOutcome {
  if (game.status === "abandoned") return "abandoned";
  if (game.status === "aborted") return "aborted";
  if (!isPlayer) return "spectator";
  if (game.winner === "draw") return "draw";
  if (game.winner === userId) return "win";
  return "loss";
}

function roundResultLabel(game: GameJson): string {
  if (game.winner === "draw") return "Draw";
  if (!game.winner) return "Round complete";
  const winner = game.players.find((player) => player.userId === game.winner);
  return winner ? `${winner.username} won` : "Round complete";
}

function buildHeadline(
  outcome: GameResultOutcome,
  phase: GameResultPhase,
  seriesWinnerId: string | null,
  userId: string,
  stats: PlayerSessionStats[],
): { headline: string; subheadline: string | null } {
  if (outcome === "abandoned") {
    return { headline: "Game abandoned", subheadline: null };
  }
  if (outcome === "aborted") {
    return { headline: "Game ended", subheadline: null };
  }
  if (outcome === "spectator") {
    if (phase === "seriesComplete" && seriesWinnerId) {
      const champion = stats.find((entry) => entry.userId === seriesWinnerId);
      return {
        headline: `${champion?.username ?? "Player"} wins the series`,
        subheadline: null,
      };
    }
    if (phase === "seriesComplete" && seriesWinnerId === null) {
      return { headline: "Series tied", subheadline: null };
    }
    return { headline: "Game over", subheadline: null };
  }

  if (phase === "seriesComplete") {
    if (seriesWinnerId === userId) {
      return {
        headline: "Series champion!",
        subheadline: "You took the match",
      };
    }
    if (seriesWinnerId === null) {
      return {
        headline: "Series tied",
        subheadline: "Evenly matched",
      };
    }
    const champion = stats.find((entry) => entry.userId === seriesWinnerId);
    return {
      headline: "Series over",
      subheadline: `${champion?.username ?? "Opponent"} wins the match`,
    };
  }

  if (phase === "roundComplete") {
    if (outcome === "win") {
      return {
        headline: "Round won!",
        subheadline: "The series continues",
      };
    }
    if (outcome === "draw") {
      return {
        headline: "Round drawn",
        subheadline: "On to the next round",
      };
    }
    return {
      headline: "Round lost",
      subheadline: "The series continues",
    };
  }

  if (outcome === "win") {
    return { headline: "You won!", subheadline: null };
  }
  if (outcome === "draw") {
    return { headline: "It's a draw", subheadline: null };
  }
  return { headline: "You lost", subheadline: null };
}

function buildSeriesLabel(matchConfig: MatchConfig): string | null {
  if (matchConfig.format === "bestOf" && matchConfig.totalRounds) {
    return `Best of ${matchConfig.totalRounds}`;
  }
  if (matchConfig.format === "fixedRounds" && matchConfig.totalRounds) {
    return `${matchConfig.totalRounds} rounds`;
  }
  return null;
}

export function buildGameResultViewModel(input: {
  game: GameJson;
  userId: string;
  series: SeriesDetail | null;
  matchConfig?: MatchConfig;
  canContinue?: boolean;
}): GameResultViewModel | null {
  const { game, userId, series, canContinue = true } = input;
  if (!isGameOver(game.status)) return null;

  const matchConfig = input.matchConfig ?? resolveMatchConfig(game.config);
  const isPlayer = game.players.some((player) => player.userId === userId);
  const outcome = resolveOutcome(game, userId, isPlayer);
  const sessionStats = buildSessionStats(game, series);
  const completedGames =
    series?.score.completedGames ?? (game.status === "completed" ? 1 : 0);
  const seriesState = detectSeriesState(
    matchConfig,
    sessionStats,
    completedGames,
  );

  const phase: GameResultPhase =
    matchConfig.format === "single"
      ? "matchComplete"
      : seriesState.complete
        ? "seriesComplete"
        : "roundComplete";

  const roundWinnerId =
    game.winner === "draw" || !game.winner ? null : game.winner;
  const { headline, subheadline } = buildHeadline(
    outcome,
    phase,
    seriesState.seriesWinnerId,
    userId,
    sessionStats,
  );

  const currentRound = series?.games.length ?? completedGames;
  const roundProgress =
    matchConfig.format === "single"
      ? null
      : {
          current: currentRound,
          total: matchConfig.totalRounds ?? null,
        };

  let primaryAction: GameResultPrimaryAction = "none";
  if (canContinue && isPlayer && game.status === "completed") {
    primaryAction = phase === "roundComplete" ? "nextRound" : "rematch";
  }

  const players: GameResultPlayer[] = game.players.map((player) => ({
    userId: player.userId,
    username: player.username,
    avatar: player.avatar ?? null,
    isRoundWinner: roundWinnerId === player.userId,
    isSeriesWinner: seriesState.seriesWinnerId === player.userId,
  }));

  return {
    phase,
    headline,
    subheadline,
    roundLabel: roundResultLabel(game),
    outcome,
    isDraw: game.winner === "draw",
    roundWinnerId,
    seriesWinnerId: seriesState.seriesWinnerId,
    players,
    sessionStats,
    roundProgress,
    seriesLabel: buildSeriesLabel(matchConfig),
    primaryAction,
    showSeriesHistory: (series?.score.totalGames ?? 1) >= 2,
    canContinue,
  };
}
