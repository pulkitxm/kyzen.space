import { listGameMeta } from "@gamelobby/games-core";

export type GameStat = {
  played: number;
  won: number;
  lost: number;
  drawn: number;
};
export type ProfileStats = Record<string, GameStat>;

export type ProfileStatGame = {
  id: string;
  name: string;
  href: string;
  coverImage?: string;
  played: number;
};

export function buildStatGames(stats: ProfileStats): ProfileStatGame[] {
  return listGameMeta().map((m) => {
    const s = stats[m.type];
    const played = s && Number.isFinite(s.played) ? s.played : 0;
    return {
      id: m.type,
      name: m.name,
      href: `/games/${m.type}`,
      coverImage: m.coverImage,
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
