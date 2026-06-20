"use client";

import type { SeriesScore } from "@kyzen/shared/types";
import { Character } from "@/components/ui";

export function SeriesScoreboard({ score }: { score: SeriesScore }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-start justify-center gap-6">
        {score.entries.map((entry) => (
          <div key={entry.userId} className="flex flex-col items-center gap-1">
            <Character
              config={entry.avatar ?? null}
              fallbackSeed={entry.username}
              size={48}
              className="rounded-full border-2 border-card bg-surface-overlay"
            />
            <span className="max-w-24 truncate text-muted-foreground text-sm">
              {entry.username}
            </span>
            <span className="font-bold text-2xl">{entry.wins}</span>
          </div>
        ))}
      </div>
      {score.draws > 0 ? (
        <span className="text-muted-foreground text-xs">
          draws: {score.draws}
        </span>
      ) : null}
    </div>
  );
}
