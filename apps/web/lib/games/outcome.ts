import { getEngine, hasEngine } from "@kyzen/games-core";
import type { GameJson } from "@kyzen/shared/types";

type OutcomeGame = Pick<GameJson, "status" | "winner" | "winners" | "players">;

const NAME_LIST = new Intl.ListFormat("en", { type: "conjunction" });

export function gameWinners(
  game: Pick<GameJson, "winner" | "winners">,
): string[] {
  if (game.winners?.length) return game.winners;
  return game.winner && game.winner !== "draw" ? [game.winner] : [];
}

function winnerNames(game: OutcomeGame, winners: string[]): string {
  if (winners.length > 3) return `${winners.length} players`;
  const names = winners.map(
    (id) => game.players.find((player) => player.userId === id)?.username,
  );
  return NAME_LIST.format(names.map((name) => name ?? "Unknown player"));
}

export function outcomeLabel(game: OutcomeGame, viewerId: string): string {
  if (game.status === "abandoned") return "Game abandoned";
  const winners = gameWinners(game);
  const seated = game.players.some((player) => player.userId === viewerId);
  if (game.winner === "draw") {
    if (!winners.length) return "It's a draw";
    if (!seated) return `Draw between ${winnerNames(game, winners)}`;
    return winners.includes(viewerId) ? "It's a draw" : "You lost";
  }
  if (!winners.length) return "Game over";
  if (!seated) return `${winnerNames(game, winners)} won`;
  if (!winners.includes(viewerId)) return "You lost";
  return winners.length > 1 ? "Your team won! 🎉" : "You won! 🎉";
}

export function resultDelayMs(
  game: Pick<GameJson, "gameType" | "status" | "gameState">,
): number {
  if (game.status !== "completed" || !hasEngine(game.gameType)) return 0;
  return getEngine(game.gameType).resultDelayMs?.(game.gameState) ?? 0;
}

export function resultRevealDelay(
  completedAt: string | null | undefined,
  delayMs: number,
  now: number,
): number {
  const completed = Date.parse(completedAt ?? "");
  if (!(delayMs > 0) || !Number.isFinite(completed)) return 0;
  return Math.min(delayMs, Math.max(0, completed + delayMs - now));
}
