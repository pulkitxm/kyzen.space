"use client";

import type { GameResultViewModel } from "@kyzen/shared/types";
import { AnimatePresence, m } from "motion/react";
import type { Ref } from "react";
import { FaArrowRight, FaRotateRight, FaTrophy } from "react-icons/fa6";
import { SessionScoreboard } from "@/components/games/session-scoreboard";
import { GlassMotionPane } from "@/components/glass/glass-pane";
import { Button } from "@/components/ui";
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

function RoundProgress({
  current,
  total,
  seriesLabel,
}: {
  current: number;
  total: number | null;
  seriesLabel: string | null;
}) {
  const pct =
    total && total > 0 ? Math.min(100, (current / total) * 100) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{seriesLabel ?? "Series"}</span>
        <span className="tabular-nums">
          Round {current}
          {total ? ` of ${total}` : ""}
        </span>
      </div>
      {pct != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
          <m.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.45 }}
          />
        </div>
      ) : null}
    </div>
  );
}

function OutcomeIcon({ model }: { model: GameResultViewModel }) {
  if (model.phase === "seriesComplete" && model.seriesWinnerId) {
    return (
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500"
      >
        <FaTrophy size={28} aria-hidden="true" />
      </m.div>
    );
  }
  if (model.outcome === "win" || model.phase === "roundComplete") {
    return (
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className={cn(
          "mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl",
          model.outcome === "win"
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-primary/10 text-primary",
        )}
      >
        <FaTrophy size={28} aria-hidden="true" />
      </m.div>
    );
  }
  return null;
}

function primaryLabel(
  model: GameResultViewModel,
  pendingLabel: string | null,
): string {
  if (pendingLabel) return pendingLabel;
  if (model.primaryAction === "nextRound") return "Next round";
  if (model.primaryAction === "rematch") return "Rematch";
  return "Continue";
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

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <AnimatePresence>
        {open ? (
          <GlassMotionPane
            key="game-result"
            ref={cardRef}
            className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.22 }}
          >
            <OutcomeIcon model={model} />

            <m.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.2 }}
            >
              <h2 className="text-center font-bold text-2xl tracking-tight">
                {model.headline}
              </h2>
              {model.subheadline ? (
                <p className="mt-1 text-center text-muted-foreground text-sm">
                  {model.subheadline}
                </p>
              ) : null}
            </m.div>

            {model.roundLabel ? (
              <m.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.2 }}
                className="mt-4 flex justify-center"
              >
                <span
                  className={cn(
                    "rounded-full px-3 py-1 font-medium text-xs",
                    model.isDraw
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {model.roundLabel}
                </span>
              </m.div>
            ) : null}

            {model.roundProgress ? (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="mt-4"
              >
                <RoundProgress
                  current={model.roundProgress.current}
                  total={model.roundProgress.total}
                  seriesLabel={model.seriesLabel}
                />
              </m.div>
            ) : null}

            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.22 }}
              className="mt-5 rounded-2xl border border-border/80 bg-surface-overlay/40 p-4"
            >
              <p className="mb-3 text-center font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Session record
              </p>
              <SessionScoreboard
                stats={model.sessionStats}
                draws={draws}
                highlightUserId={userId}
                seriesWinnerId={model.seriesWinnerId}
              />
            </m.div>

            {actions.primaryError ? (
              <p className="mt-3 text-center text-danger text-sm">
                {actions.primaryError}
              </p>
            ) : null}

            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.22 }}
              className="mt-5 flex flex-col gap-2"
            >
              {showPrimary ? (
                <Button
                  onClick={actions.onPrimary}
                  disabled={actions.primaryBusy}
                  loading={actions.primaryBusy}
                >
                  {model.primaryAction === "nextRound" ? (
                    <FaArrowRight size={14} aria-hidden="true" />
                  ) : (
                    <FaRotateRight size={14} aria-hidden="true" />
                  )}
                  {primaryLabel(model, actions.primaryPendingLabel ?? null)}
                </Button>
              ) : null}
              {actions.onChat ? (
                <Button variant="secondary" onClick={actions.onChat}>
                  Chat
                </Button>
              ) : null}
              {model.showSeriesHistory && actions.onViewSeries ? (
                <Button variant="secondary" onClick={actions.onViewSeries}>
                  View series
                </Button>
              ) : null}
              {actions.onClose ? (
                <Button variant="ghost" onClick={actions.onClose}>
                  Close
                </Button>
              ) : null}
            </m.div>
          </GlassMotionPane>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
