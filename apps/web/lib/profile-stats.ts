import { GAMES } from "@/lib/games";

export type GameStat = { played: number; won: number; lost: number; drawn: number };
export type ProfileStats = Record<string, GameStat>;

export type ProfileStatGame = {
  id: string;
  name: string;
  href: string;
  coverImage?: string;
  played: number;
};

/** Join backend stats with the frontend catalog into per-game played counts. */
export function buildStatGames(stats: ProfileStats): ProfileStatGame[] {
  return GAMES.map((g) => {
    const s = stats[g.id];
    const played = s && Number.isFinite(s.played) ? s.played : 0;
    return {
      id: g.id,
      name: g.name,
      href: g.href,
      coverImage: g.coverImage,
      played,
    };
  });
}

export function totalGamesPlayed(stats: ProfileStats): number {
  return Object.values(stats).reduce(
    (sum, s) => sum + (Number.isFinite(s?.played) ? s.played : 0),
    0,
  );
}

export function pickMostPlayed(
  statGames: ProfileStatGame[],
): ProfileStatGame | null {
  let best: ProfileStatGame | null = null;
  for (const g of statGames) if (!best || g.played > best.played) best = g;
  return best && best.played >= 1 ? best : null;
}
