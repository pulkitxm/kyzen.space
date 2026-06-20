"use client";

import type { Mark } from "@kyzen/shared/types";

const STROKE = "color-mix(in srgb, currentColor 62%, #0a0e14)";

const X_POINTS =
  "39,13 61,13 61,39 87,39 87,61 61,61 61,87 39,87 39,61 13,61 13,39 39,39";

const O_PATH =
  "M16,50 a34,34 0 1,0 68,0 a34,34 0 1,0 -68,0 Z M35,50 a15,15 0 1,1 30,0 a15,15 0 1,1 -30,0 Z";

export function TttMarkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ttt-mark-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TttMark({
  mark,
  className,
  decorative = false,
}: {
  mark: Mark;
  className?: string;
  decorative?: boolean;
}) {
  const colorClass = mark === "X" ? "text-primary" : "text-muted-foreground";
  return (
    <svg
      viewBox="0 0 100 100"
      className={[colorClass, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={mark}
      aria-hidden={decorative || undefined}
    >
      {mark === "X" ? (
        <g transform="rotate(45 50 50)">
          <polygon
            points={X_POINTS}
            fill="currentColor"
            strokeWidth="5"
            strokeLinejoin="round"
            style={{ stroke: STROKE }}
          />
          <polygon points={X_POINTS} fill="url(#ttt-mark-sheen)" />
        </g>
      ) : (
        <>
          <path
            d={O_PATH}
            fillRule="evenodd"
            fill="currentColor"
            strokeWidth="5"
            style={{ stroke: STROKE }}
          />
          <path d={O_PATH} fillRule="evenodd" fill="url(#ttt-mark-sheen)" />
        </>
      )}
    </svg>
  );
}
