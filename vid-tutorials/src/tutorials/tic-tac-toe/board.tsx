import type { CSSProperties } from "react";
import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MarkGlyph } from "./marks";
import { markColor, type TutorialMark } from "./palette";

export type BoardCell = { mark: TutorialMark; at: number } | null;

export type BoardWin = {
  line: readonly [number, number, number];
  mark: TutorialMark;
  at: number;
};

export type BoardGhost = {
  cell: number;
  mark: TutorialMark;
  from: number;
  until: number;
};

const CELL_POSITIONS = [
  { id: "nw", row: 0, col: 0 },
  { id: "n", row: 0, col: 1 },
  { id: "ne", row: 0, col: 2 },
  { id: "w", row: 1, col: 0 },
  { id: "c", row: 1, col: 1 },
  { id: "e", row: 1, col: 2 },
  { id: "sw", row: 2, col: 0 },
  { id: "s", row: 2, col: 1 },
  { id: "se", row: 2, col: 2 },
];

const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

const NO_GHOSTS: readonly BoardGhost[] = [];

const NO_GLOW_CELLS: readonly number[] = [];

function cellCenter(index: number, cellSize: number, gap: number) {
  return {
    x: (index % 3) * (cellSize + gap) + cellSize / 2,
    y: Math.floor(index / 3) * (cellSize + gap) + cellSize / 2,
  };
}

function WinLine({
  win,
  size,
  cellSize,
  gap,
}: {
  win: BoardWin;
  size: number;
  cellSize: number;
  gap: number;
}) {
  const frame = useCurrentFrame();
  const start = cellCenter(win.line[0], cellSize, gap);
  const end = cellCenter(win.line[2], cellSize, gap);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const span = Math.hypot(dx, dy) || 1;
  const overshoot = cellSize * 0.3;
  const ox = (dx / span) * overshoot;
  const oy = (dy / span) * overshoot;
  const length = span + overshoot * 2;
  const progress = interpolate(frame, [win.at, win.at + 20], [0, 1], {
    easing: ENTRANCE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <line
        x1={start.x - ox}
        y1={start.y - oy}
        x2={end.x + ox}
        y2={end.y + oy}
        stroke={markColor(win.mark)}
        strokeWidth={size * 0.028}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - progress)}
        opacity={progress > 0 ? 1 : 0}
      />
    </svg>
  );
}

export function Board({
  cells,
  size = 470,
  buildStart = 0,
  buildStagger = 0,
  win,
  ghosts = NO_GHOSTS,
  glowCells = NO_GLOW_CELLS,
  glowAt = 0,
  dimAt,
  style,
}: {
  cells: readonly BoardCell[];
  size?: number;
  buildStart?: number;
  buildStagger?: number;
  win?: BoardWin;
  ghosts?: readonly BoardGhost[];
  glowCells?: readonly number[];
  glowAt?: number;
  dimAt?: number;
  style?: CSSProperties;
}) {
  const glowingCells = new Set(glowCells);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const gap = Math.round(size * 0.035);
  const cellSize = (size - gap * 2) / 3;
  const radius = Math.round(cellSize * 0.15);
  const dim =
    dimAt === undefined
      ? 1
      : interpolate(frame, [dimAt, dimAt + 20], [1, 0.45], {
          easing: ENTRANCE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const glowIn =
    glowCells.length === 0
      ? 0
      : interpolate(frame, [glowAt, glowAt + 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const glowPulse = glowIn * (0.75 + 0.25 * Math.sin((frame - glowAt) / 8));
  const glowColor = `color-mix(in srgb, ${markColor(win?.mark ?? "X")} 55%, transparent)`;
  const radiusVar = { "--ttt-cell-radius": `${radius}px` } as CSSProperties;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        ...radiusVar,
        ...style,
      }}
    >
      {CELL_POSITIONS.map(({ id, row, col }, index) => {
        const cell = cells[index] ?? null;
        const buildAt = buildStart + index * buildStagger;
        const cellIn =
          buildStagger === 0
            ? 1
            : interpolate(frame, [buildAt, buildAt + 16], [0, 1], {
                easing: ENTRANCE,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
        const markIn =
          cell === null || frame < cell.at
            ? 0
            : spring({
                frame: frame - cell.at,
                fps,
                config: { damping: 12, stiffness: 160, mass: 0.8 },
              });
        const ghost = ghosts.find((entry) => entry.cell === index);
        const ghostOpacity = ghost
          ? interpolate(
              frame,
              [ghost.from, ghost.from + 10, ghost.until - 1, ghost.until],
              [0, 0.3, 0.3, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : 0;
        const glowing = glowingCells.has(index);
        return (
          <div
            key={id}
            className="ttt-cell"
            style={{
              left: col * (cellSize + gap),
              top: row * (cellSize + gap),
              width: cellSize,
              height: cellSize,
              opacity: cellIn * dim,
              transform: `scale(${0.7 + cellIn * 0.3})`,
              boxShadow: glowing
                ? `0 0 ${Math.round(44 * glowPulse)}px ${glowColor}`
                : "0 8px 24px rgba(0, 0, 0, 0.25)",
            }}
          >
            {ghost && ghostOpacity > 0 ? (
              <MarkGlyph
                mark={ghost.mark}
                size={cellSize * 0.62}
                style={{ position: "absolute", opacity: ghostOpacity }}
              />
            ) : null}
            {cell ? (
              <MarkGlyph
                mark={cell.mark}
                size={cellSize * 0.62}
                style={{ transform: `scale(${markIn})` }}
              />
            ) : null}
          </div>
        );
      })}
      {win ? (
        <WinLine win={win} size={size} cellSize={cellSize} gap={gap} />
      ) : null}
    </div>
  );
}
