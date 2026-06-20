"use client";

import type { SeriesDetail } from "@kyzen/shared/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowRight } from "react-icons/fa6";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { clientFetchJson } from "@/lib/api-client";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";

function rowLabel(
  status: string,
  winner: string | null,
  winnerUsername: string | null,
): string {
  if (status !== "completed") return "in progress";
  if (winner === "draw") return "draw";
  return winnerUsername ? `${winnerUsername} won` : "finished";
}

export function SeriesDetailModal({ gameId }: { gameId: string }) {
  const { closeAll } = useLayeredPopup();
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [gameId]);

  if (error) {
    return (
      <p className="text-muted-foreground text-sm">
        Could not load the series.
      </p>
    );
  }
  if (!detail) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <SeriesScoreboard score={detail.score} />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-muted-foreground text-xs uppercase">
          Games
        </span>
        {detail.games.map((g) => (
          <Link
            key={g.gameId}
            href={`/play/${g.gameId}`}
            onClick={() => closeAll()}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-surface-overlay"
          >
            <span className="text-sm">
              {g.gameNumber}. {rowLabel(g.status, g.winner, g.winnerUsername)}
            </span>
            <FaArrowRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
