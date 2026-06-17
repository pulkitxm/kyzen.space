"use client";

import type { PlayerSessionStats } from "@kyzen/shared/types";
import { FaMinus, FaTrophy } from "react-icons/fa6";
import { Character } from "@/components/ui";
import { cn } from "@/lib/utils";

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "win" | "loss";
}) {
  return (
    <div
      className={cn(
        "flex min-w-14 flex-col items-center rounded-xl border px-2.5 py-1.5",
        tone === "win" && "border-amber-500/30 bg-amber-500/10",
        tone === "loss" && "border-border bg-surface-overlay/60",
        tone === "default" && "border-border bg-surface-overlay/40",
      )}
    >
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="font-bold text-lg leading-none">{value}</span>
    </div>
  );
}

function ScoreBar({
  leftWins,
  rightWins,
  draws,
}: {
  leftWins: number;
  rightWins: number;
  draws: number;
}) {
  const total = Math.max(leftWins + rightWins + draws, 1);
  const leftPct = (leftWins / total) * 100;
  const rightPct = (rightWins / total) * 100;
  const drawPct = (draws / total) * 100;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
      <div
        className="bg-primary transition-all duration-500"
        style={{ width: `${leftPct}%` }}
      />
      {draws > 0 ? (
        <div
          className="bg-muted-foreground/40 transition-all duration-500"
          style={{ width: `${drawPct}%` }}
        />
      ) : null}
      <div
        className="bg-amber-500 transition-all duration-500"
        style={{ width: `${rightPct}%` }}
      />
    </div>
  );
}

export function SessionScoreboard({
  stats,
  draws = 0,
  highlightUserId,
  seriesWinnerId,
}: {
  stats: PlayerSessionStats[];
  draws?: number;
  highlightUserId?: string;
  seriesWinnerId?: string | null;
}) {
  if (stats.length === 0) return null;

  const isDuel = stats.length === 2;
  const [left, right] = isDuel ? stats : [stats[0], null];

  return (
    <div className="flex flex-col gap-3">
      {isDuel && left && right ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <PlayerColumn
              stats={left}
              align="start"
              highlight={highlightUserId === left.userId}
              isSeriesWinner={seriesWinnerId === left.userId}
            />
            <div className="flex flex-col items-center gap-1 px-1">
              <span className="font-bold text-2xl text-muted-foreground tabular-nums">
                {left.wins}
              </span>
              <FaMinus
                className="text-muted-foreground/60"
                size={12}
                aria-hidden="true"
              />
              <span className="font-bold text-2xl text-muted-foreground tabular-nums">
                {right.wins}
              </span>
            </div>
            <PlayerColumn
              stats={right}
              align="end"
              highlight={highlightUserId === right.userId}
              isSeriesWinner={seriesWinnerId === right.userId}
            />
          </div>
          <ScoreBar leftWins={left.wins} rightWins={right.wins} draws={draws} />
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-xs">
            <span>{left.played} played</span>
            {draws > 0 ? <span>{draws} draws</span> : null}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-4">
          {stats.map((entry) => (
            <PlayerColumn
              key={entry.userId}
              stats={entry}
              align="center"
              highlight={highlightUserId === entry.userId}
              isSeriesWinner={seriesWinnerId === entry.userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerColumn({
  stats,
  align,
  highlight,
  isSeriesWinner,
}: {
  stats: PlayerSessionStats;
  align: "start" | "center" | "end";
  highlight?: boolean;
  isSeriesWinner?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2",
        align === "start" && "items-start",
        align === "center" && "items-center",
        align === "end" && "items-end",
      )}
    >
      <div
        className={cn(
          "relative rounded-full",
          highlight &&
            "ring-2 ring-primary ring-offset-2 ring-offset-surface-raised",
          isSeriesWinner &&
            "ring-2 ring-amber-500 ring-offset-2 ring-offset-surface-raised",
        )}
      >
        <Character
          config={stats.avatar ?? null}
          fallbackSeed={stats.username}
          size={52}
          className="rounded-full border-2 border-card bg-surface-overlay"
        />
        {isSeriesWinner ? (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-background">
            <FaTrophy size={10} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <span className="max-w-24 truncate font-medium text-sm">
        {stats.username}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <StatPill label="W" value={stats.wins} tone="win" />
        <StatPill label="L" value={stats.losses} tone="loss" />
        <StatPill label="P" value={stats.played} />
      </div>
    </div>
  );
}
