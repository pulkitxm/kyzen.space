import type { GameJson } from "@kyzen/shared/types";

type OutcomeGame = Pick<GameJson, "status" | "winner" | "winners" | "players">;

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
  return new Intl.ListFormat("en", { type: "conjunction" }).format(
    names.map((name) => name ?? "Unknown player"),
  );
}

export function outcomeLabel(game: OutcomeGame, viewerId: string): string {
  if (game.status === "abandoned") return "Game abandoned";
  if (game.winner === "draw") return "It's a draw";
  const winners = gameWinners(game);
  if (!winners.length) return "Game over";
  if (!game.players.some((player) => player.userId === viewerId))
    return `${winnerNames(game, winners)} won`;
  if (!winners.includes(viewerId)) return "You lost";
  return winners.length > 1 ? "Your team won! 🎉" : "You won! 🎉";
}
