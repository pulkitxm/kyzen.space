import { GAMES } from "@/lib/games";

export const PROFILE_ACTIVITY_PAGE_SIZE = 5;

export type ProfileActivityApiRow = {
  id: string;
  gameType: string;
  status: string;
  updatedAt: string;
};

export type ProfileActivityGameRow = {
  id: string;
  href: string;
  name: string;
  coverImage?: string;
  status: string;
  updatedAt: string;
};

export function mapApiRowToActivity(
  row: ProfileActivityApiRow,
): ProfileActivityGameRow {
  const entry = GAMES.find((g) => g.id === row.gameType);
  return {
    id: row.id,
    href: `/games/${row.gameType}/${row.id}`,
    name: entry?.name ?? row.gameType.replace(/-/g, " "),
    coverImage: entry?.coverImage,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

export function mapApiRowsToActivity(
  rows: ProfileActivityApiRow[],
): ProfileActivityGameRow[] {
  return rows.map(mapApiRowToActivity);
}
