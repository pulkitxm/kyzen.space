"use client";

import type { GameResultViewModel } from "@kyzen/shared/types";
import { AnimatePresence, m } from "motion/react";
import type { Ref } from "react";
import {
  FaArrowRight,
  FaRotateRight,
  FaTrophy,
  FaXmark,
} from "react-icons/fa6";
import { GlassMotionPane } from "@/components/glass/glass-pane";
import { Button, Character } from "@/components/ui";
import { cn } from "@/lib/utils";

export type GameResultModalActions = {
  onPrimary?: () => void;
  onChat?: () => void;
  onViewSeries?: () => void;
  onClose?: () => void;
  primaryBusy?: boolean;
  primaryError?: string | null;
  primaryPendingLabel?: string | null;
};

function primaryLabel(
  model: GameResultViewModel,
  pendingLabel: string | null,
): string {
  if (pendingLabel) return pendingLabel;
  if (model.primaryAction === "nextRound") return "Next round";
  if (model.primaryAction === "rematch") return "Rematch";
  return "Continue";
}

function MatchScorePanel({
  model,
  userId,
  draws,
}: {
  model: GameResultViewModel;
  userId: string;
  draws: number;
}) {
  const stats = model.sessionStats;
  const isDuel = stats.length === 2;
  const [left, right] = isDuel ? stats : [stats[0], null];
  const roundPct =
    model.roundProgress?.total && model.roundProgress.total > 0
      ? Math.min(
          100,
          (model.roundProgress.current / model.roundProgress.total) * 100,
        )
      : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface-overlay/40">
      {isDuel && left && right ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-4 pb-3">
          <PlayerSide
            stats={left}
            align="start"
            highlight={userId === left.userId}
            isRoundWinner={model.roundWinnerId === left.userId}
            isSeriesWinner={model.seriesWinnerId === left.userId}
          />
          <div className="flex flex-col items-center gap-0.5 px-1">
            <div className="flex items-baseline gap-1.5 font-bold text-3xl tabular-nums tracking-tight">
              <span>{left.wins}</span>
              <span className="text-lg text-muted-foreground">:</span>
              <span>{right.wins}</span>
            </div>
            {draws > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {draws} draw{draws === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <PlayerSide
            stats={right}
            align="end"
            highlight={userId === right.userId}
            isRoundWinner={model.roundWinnerId === right.userId}
            isSeriesWinner={model.seriesWinnerId === right.userId}
          />
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-4 px-4 pt-4 pb-3">
          {stats.map((entry) => (
            <PlayerSide
              key={entry.userId}
              stats={entry}
              align="center"
              highlight={userId === entry.userId}
              isRoundWinner={model.roundWinnerId === entry.userId}
              isSeriesWinner={model.seriesWinnerId === entry.userId}
            />
          ))}
        </div>
      )}

      {(model.roundLabel || model.roundProgress || model.seriesLabel) && (
        <div className="space-y-2 border-border/70 border-t px-4 py-3">
          {model.roundLabel ? (
            <p className="text-center text-muted-foreground text-xs">
              {model.roundLabel}
            </p>
          ) : null}
          {model.roundProgress ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{model.seriesLabel ?? "Series"}</span>
                <span className="tabular-nums">
                  Round {model.roundProgress.current}
                  {model.roundProgress.total
                    ? ` / ${model.roundProgress.total}`
                    : ""}
                </span>
              </div>
              {roundPct != null ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                  <m.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${roundPct}%` }}
                    transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.45 }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function PlayerSide({
  stats,
  align,
  highlight,
  isRoundWinner,
  isSeriesWinner,
}: {
  stats: {
    userId: string;
    username: string;
    avatar?: import("@kyzen/avatar").AvatarConfig | null;
    wins: number;
  };
  align: "start" | "center" | "end";
  highlight?: boolean;
  isRoundWinner?: boolean;
  isSeriesWinner?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        align === "start" && "items-start text-left",
        align === "center" && "items-center text-center",
        align === "end" && "items-end text-right",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 rounded-full",
          highlight && "ring-2 ring-primary ring-offset-2 ring-offset-surface-raised",
          isSeriesWinner &&
            "ring-2 ring-amber-500 ring-offset-2 ring-offset-surface-raised",
          isRoundWinner &&
            !isSeriesWinner &&
            "ring-2 ring-emerald-500/80 ring-offset-2 ring-offset-surface-raised",
        )}
      >
        <Character
          config={stats.avatar ?? null}
          fallbackSeed={stats.username}
          size={44}
          className="rounded-full border border-border bg-card"
        />
        {isSeriesWinner ? (
          <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-background">
            <FaTrophy size={9} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <span className="max-w-[5.5rem] truncate font-medium text-sm">
        {stats.username}
      </span>
    </div>
  );
}

export function GameResultReopenChip({
  headline,
  onClick,
}: {
  headline: string;
  onClick: () => void;
}) {
  return (
    <m.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="pointer-events-auto fixed bottom-6 left-1/2 z-40 flex max-w-[min(100%-2rem,20rem)] -translate-x-1/2 items-center gap-2.5 rounded-full border border-border bg-surface-raised/95 px-4 py-2.5 shadow-lg backdrop-blur-md outline-none transition hover:bg-surface-overlay"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FaTrophy size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block font-semibold text-foreground text-sm leading-tight">
          View results
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {headline}
        </span>
      </span>
    </m.button>
  );
}

export function GameResultModal({
  open,
  model,
  actions,
  userId,
  draws = 0,
  cardRef,
}: {
  open: boolean;
  model: GameResultViewModel;
  actions: GameResultModalActions;
  userId: string;
  draws?: number;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const showPrimary =
    model.primaryAction !== "none" && Boolean(actions.onPrimary);
  const secondaryCount =
    Number(Boolean(actions.onChat)) +
    Number(Boolean(model.showSeriesHistory && actions.onViewSeries));

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <AnimatePresence>
        {open ? (
          <>
            <m.div
              key="game-result-backdrop"
              className="pointer-events-auto absolute inset-0 bg-background/60 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={actions.onClose}
              aria-hidden="true"
            />
            <GlassMotionPane
              key="game-result"
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="game-result-title"
              className="pointer-events-auto relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-2xl"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.22 }}
            >
              <header className="flex items-center justify-between gap-3 border-border/80 border-b px-4 py-3">
                <div className="min-w-0">
                  {model.seriesLabel ? (
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      {model.seriesLabel}
                    </p>
                  ) : (
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      Match result
                    </p>
                  )}
                </div>
                {actions.onClose ? (
                  <button
                    type="button"
                    onClick={actions.onClose}
                    aria-label="Close results"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-surface-overlay hover:text-foreground"
                  >
                    <FaXmark size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </header>

              <div className="flex flex-col gap-4 px-4 py-5">
                <div className="space-y-1 text-center">
                  <h2
                    id="game-result-title"
                    className="font-bold text-2xl tracking-tight"
                  >
                    {model.headline}
                  </h2>
                  {model.subheadline ? (
                    <p className="text-muted-foreground text-sm">
                      {model.subheadline}
                    </p>
                  ) : null}
                </div>

                <MatchScorePanel model={model} userId={userId} draws={draws} />

                {actions.primaryError ? (
                  <p className="text-center text-danger text-sm">
                    {actions.primaryError}
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-col gap-2 border-border/80 border-t bg-surface-overlay/30 px-4 py-4">
                {showPrimary ? (
                  <Button
                    onClick={actions.onPrimary}
                    disabled={actions.primaryBusy}
                    loading={actions.primaryBusy}
                    className="w-full"
                  >
                    {model.primaryAction === "nextRound" ? (
                      <FaArrowRight size={14} aria-hidden="true" />
                    ) : (
                      <FaRotateRight size={14} aria-hidden="true" />
                    )}
                    {primaryLabel(model, actions.primaryPendingLabel ?? null)}
                  </Button>
                ) : null}
                {secondaryCount > 0 ? (
                  <div
                    className={cn(
                      "grid gap-2",
                      secondaryCount === 2 ? "grid-cols-2" : "grid-cols-1",
                    )}
                  >
                    {actions.onChat ? (
                      <Button variant="secondary" onClick={actions.onChat}>
                        Chat
                      </Button>
                    ) : null}
                    {model.showSeriesHistory && actions.onViewSeries ? (
                      <Button variant="secondary" onClick={actions.onViewSeries}>
                        Series history
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </footer>
            </GlassMotionPane>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
