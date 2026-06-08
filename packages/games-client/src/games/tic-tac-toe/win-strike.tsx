"use client";

import type { Mark } from "@gamelobby/shared/types";

const CELL_OFFSET = 15.556;
const CELL_SPAN = 34.444;
const OVERSHOOT = 10;

function axis(index: number): number {
  return CELL_OFFSET + CELL_SPAN * index;
}

export function WinStrike({
  line,
  mark,
  animate,
}: {
  line: readonly [number, number, number];
  mark: Mark;
  animate: boolean;
}) {
  const [start, , end] = line;
  const ax = axis(start % 3);
  const ay = axis(Math.floor(start / 3));
  const bx = axis(end % 3);
  const by = axis(Math.floor(end / 3));
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (dx / len) * OVERSHOOT;
  const oy = (dy / len) * OVERSHOOT;
  const colorClass = mark === "X" ? "text-primary" : "text-muted-foreground";

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${colorClass}`}
    >
      <line
        x1={ax - ox}
        y1={ay - oy}
        x2={bx + ox}
        y2={by + oy}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        className={animate ? "animate-ttt-strike" : undefined}
        style={{ strokeDashoffset: animate ? 1 : 0 }}
      />
    </svg>
  );
}
