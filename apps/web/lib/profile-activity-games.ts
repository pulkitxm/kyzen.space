import { listGameMeta } from "@gamelobby/games-core";
import type { GameType } from "@gamelobby/shared/types";

export const PROFILE_ACTIVITY_PAGE_SIZE = 5;

export type ProfileActivityApiRow = {
  id: string;
  gameType: GameType;
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
  const entry = listGameMeta().find((m) => m.type === row.gameType);
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
