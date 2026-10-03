import type { GameRecord } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";

export function computeRematchSeating(prev: GameRecord): string[] {
  const { engine } = getDefinition(prev.gameType);
  const roles = prev.players.map((_, index) => engine.roleForSeat(index));
  const firstRole = roles[0];
  const ordered = [...prev.players].sort(
    (a, b) => roles.indexOf(a.role) - roles.indexOf(b.role),
  );
  const ids = ordered.map((p) => p.userId);

  if (ids.length === 2) {
    const [a, b] = ids as [string, string];
    const prevStarter = ordered.find((p) => p.role === firstRole)?.userId ?? a;
    let firstMover: string;
    if (prev.winner !== null && prev.winner !== "draw") {
      firstMover = prev.winner === a ? b : a;
    } else {
      firstMover = prevStarter === a ? b : a;
    }
    return firstMover === a ? [a, b] : [b, a];
  }

  const head = ids[0];
  return head === undefined ? ids : [...ids.slice(1), head];
}
