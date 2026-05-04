import { GAMES } from "@/lib/games";

/** Recent-games pagination size on public profiles */
export const PROFILE_ACTIVITY_PAGE_SIZE = 5;

export type ProfileActivityGameRow = {
  id: string;
  href: string;
  name: string;
  coverImage?: string;
  status: string;
  updatedAt: string;
};

type GameLean = {
  _id: unknown;
  gameType: string;
  status: string;
  updatedAt?: Date | null;
  createdAt?: Date | null;
};

export function mapGamesToProfileActivityRows(
  games: GameLean[],
): ProfileActivityGameRow[] {
  return games.map((g) => {
    const entry = GAMES.find((x) => x.id === g.gameType);
    const ts = g.updatedAt ?? g.createdAt ?? new Date();
    return {
      id: String(g._id),
      href: `/games/${g.gameType}/${String(g._id)}`,
      name: entry?.name ?? g.gameType.replace(/-/g, " "),
      coverImage: entry?.coverImage,
      status: g.status,
      updatedAt: new Date(ts).toISOString(),
    };
  });
}
