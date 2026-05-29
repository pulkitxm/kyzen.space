"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { ProfileActivityGameRow } from "@/lib/profile-activity-games";
import { PROFILE_ACTIVITY_PAGE_SIZE } from "@/lib/profile-activity-games";
import { formatRelativeTime } from "@/lib/profile-helpers";

function statusLabel(status: string): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "active":
      return "In progress";
    case "completed":
      return "Finished";
    case "abandoned":
      return "Ended";
    default:
      return status;
  }
}

function RecentGameThumb({
  cover,
  name,
}: {
  cover: string | undefined;
  name: string;
}) {
  return (
    <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-overlay">
      {cover ? (
        <Image src={cover} alt="" fill className="object-cover" sizes="56px" />
      ) : (
          <div className="flex h-full items-center justify-center text-xs font-semibold uppercase text-muted-foreground">
          {name.slice(0, 2)}
        </div>
      )}
    </div>
  );
}

export function PaginatedRecentGames({
  profileUsername,
  initialGames,
  initialHasMore,
}: {
  profileUsername: string;
  initialGames: ProfileActivityGameRow[];
  initialHasMore: boolean;
}) {
  const [games, setGames] = useState(initialGames);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const offset = games.length;
      const url = `/api/profiles/${encodeURIComponent(profileUsername)}/recent-games?offset=${offset}&limit=${PROFILE_ACTIVITY_PAGE_SIZE}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as {
        games: ProfileActivityGameRow[];
        hasMore: boolean;
      };
      setGames((prev) => [...prev, ...data.games]);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, [games.length, hasMore, loading, profileUsername]);

  const rows = useMemo(
    () =>
      games.map((g) => ({
        row: g,
        when: formatRelativeTime(new Date(g.updatedAt)),
      })),
    [games],
  );

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Recent games
      </h3>
      <ul className="mt-2 space-y-2">
        {rows.map(({ row, when }) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="flex gap-3 rounded-xl border border-border bg-surface-overlay/40 p-3 transition hover:border-border/60 hover:bg-surface-hover/80"
            >
              <RecentGameThumb cover={row.coverImage} name={row.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-card-foreground">{row.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{when}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {statusLabel(row.status)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-border bg-surface-overlay/50 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-border/60 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void loadMore()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
