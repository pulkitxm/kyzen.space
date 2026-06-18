"use client";

import type { Cell, Mark } from "@kyzen/shared/types";
import { m, useReducedMotion } from "motion/react";
import { TttMark } from "./marks";
import { WinStrike } from "./win-strike";

const CELL_KEYS = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"] as const;

export function TttBoard({
  board,
  myRole,
  canMove,
  active,
  glow,
  winningLine,
  winMark,
  winAnimate,
  onPlay,
  onHoverCell,
}: {
  board: Cell[];
  myRole: Mark | null;
  canMove: boolean;
  active: boolean;
  glow: boolean;
  winningLine: readonly [number, number, number] | null;
  winMark: Mark | null;
  winAnimate: boolean;
  onPlay: (row: number, col: number) => void;
  onHoverCell: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const winSet = winningLine ? new Set<number>(winningLine) : null;

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 -z-10 rounded-4xl blur-2xl transition-opacity duration-500",
          glow ? "bg-primary/25 opacity-100" : "bg-primary/10 opacity-60",
        ].join(" ")}
      />
      <div
        className={[
          "rounded-[1.75rem] border p-2.5 transition-all duration-300 sm:p-3",
          glow
            ? "border-primary/50 bg-surface-overlay/70 shadow-[0_0_60px_-18px_var(--color-primary)]"
            : "border-border bg-surface-overlay/40",
        ].join(" ")}
      >
        <div className="relative grid grid-cols-3 gap-2.5 sm:gap-3">
          {CELL_KEYS.map((cellKey, idx) => {
            const row = Math.floor(idx / 3);
            const col = idx % 3;
            const mark = board[idx];
            const playable = canMove && mark === null && active;
            const ghostMark = playable ? myRole : null;
            const isWinCell = winSet?.has(idx) ?? false;
            return (
              <button
                key={cellKey}
                type="button"
                disabled={!playable}
                onMouseEnter={() => {
                  if (playable) onHoverCell();
                }}
                onClick={() => {
                  if (playable) onPlay(row, col);
                }}
                className={[
                  "group relative flex aspect-square w-[clamp(4.5rem,9vw,7rem)] items-center justify-center rounded-2xl border outline-none transition",
                  "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  isWinCell
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-surface-raised enabled:hover:border-primary/40 enabled:hover:bg-surface-overlay",
                ].join(" ")}
              >
                {mark ? (
                  <m.span
                    initial={reduceMotion ? false : { scale: 0.35, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 460, damping: 26 }
                    }
                    className="flex size-[62%] items-center justify-center"
                  >
                    <TttMark mark={mark} className="size-full" />
                  </m.span>
                ) : ghostMark ? (
                  <TttMark
                    mark={ghostMark}
                    decorative
                    className="size-[62%] opacity-0 transition-opacity duration-150 group-hover:opacity-35 group-focus-visible:opacity-35"
                  />
                ) : null}
              </button>
            );
          })}
          {winningLine && winMark ? (
            <WinStrike line={winningLine} mark={winMark} animate={winAnimate} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
