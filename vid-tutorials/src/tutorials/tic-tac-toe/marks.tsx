import type { CSSProperties } from "react";

export type TutorialMark = "X" | "O";

const STROKE = "color-mix(in srgb, currentColor 62%, #0a0e14)";

const X_POINTS =
  "39,13 61,13 61,39 87,39 87,61 61,61 61,87 39,87 39,61 13,61 13,39 39,39";

const O_PATH =
  "M16,50 a34,34 0 1,0 68,0 a34,34 0 1,0 -68,0 Z M35,50 a15,15 0 1,1 30,0 a15,15 0 1,1 -30,0 Z";

export function markColor(mark: TutorialMark): string {
  return mark === "X" ? "var(--primary)" : "var(--muted-foreground)";
}

export function MarkGlyph({
  mark,
  size,
  style,
}: {
  mark: TutorialMark;
  size: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ color: markColor(mark), display: "block", ...style }}
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
        </g>
      ) : (
        <path
          d={O_PATH}
          fillRule="evenodd"
          fill="currentColor"
          strokeWidth="5"
          style={{ stroke: STROKE }}
        />
      )}
    </svg>
  );
}
