import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Board, type BoardCell } from "../board";
import { Heading } from "../heading";

const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

const LINES: {
  cells: readonly [number, number, number];
  label: string;
}[] = [
  { cells: [3, 4, 5], label: "Across" },
  { cells: [1, 4, 7], label: "Down" },
  { cells: [0, 4, 8], label: "Diagonal" },
];

function lineBoard(
  line: readonly [number, number, number],
  base: number,
): BoardCell[] {
  return Array.from({ length: 9 }, (_, index) => {
    const position = line.indexOf(index);
    return position === -1 ? null : { mark: "X", at: base + position * 6 };
  });
}

export function GoalScene() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Heading
        title="Line up three in a row"
        subtitle="Across, down, or diagonally - any line of three wins"
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 170,
        }}
      >
        <div style={{ display: "flex", gap: 110 }}>
          {LINES.map((entry, index) => {
            const boardAt = 24 + index * 12;
            const marksAt = 48 + index * 28;
            const lineAt = marksAt + 22;
            const boardIn = interpolate(
              frame,
              [boardAt, boardAt + 20],
              [0, 1],
              {
                easing: ENTRANCE,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );
            const labelIn = interpolate(
              frame,
              [lineAt + 8, lineAt + 26],
              [0, 1],
              {
                easing: ENTRANCE,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );
            return (
              <div
                key={entry.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 32,
                  opacity: boardIn,
                  transform: `translateY(${(1 - boardIn) * 40}px) scale(${0.92 + boardIn * 0.08})`,
                }}
              >
                <Board
                  cells={lineBoard(entry.cells, marksAt)}
                  size={330}
                  win={{ line: entry.cells, mark: "X", at: lineAt }}
                />
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 600,
                    color: "var(--muted-foreground)",
                    opacity: labelIn,
                  }}
                >
                  {entry.label}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
