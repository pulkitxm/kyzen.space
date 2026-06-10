import { FaHandshake } from "react-icons/fa6";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Board, type BoardCell } from "../board";
import { Heading } from "../heading";

const MOVE_ORDER: { cell: number; mark: "X" | "O" }[] = [
  { cell: 0, mark: "X" },
  { cell: 1, mark: "O" },
  { cell: 2, mark: "X" },
  { cell: 4, mark: "O" },
  { cell: 3, mark: "X" },
  { cell: 5, mark: "O" },
  { cell: 7, mark: "X" },
  { cell: 6, mark: "O" },
  { cell: 8, mark: "X" },
];

const BADGE_AT = 132;

function drawBoard(): BoardCell[] {
  const cells: BoardCell[] = Array.from({ length: 9 }, () => null);
  MOVE_ORDER.forEach((move, index) => {
    cells[move.cell] = { mark: move.mark, at: 22 + index * 9 };
  });
  return cells;
}

export function DrawScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badgePop =
    frame < BADGE_AT
      ? 0
      : spring({
          frame: frame - BADGE_AT,
          fps,
          config: { damping: 11, stiffness: 160, mass: 0.9 },
        });
  return (
    <AbsoluteFill>
      <Heading
        title="Full board, no line? It's a draw"
        subtitle="All nine cells filled and nobody lined up three"
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 170,
        }}
      >
        <div style={{ position: "relative" }}>
          <Board cells={drawBoard()} size={470} dimAt={BADGE_AT - 6} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "24px 52px",
                borderRadius: 999,
                backgroundColor: "var(--card)",
                border: "2px solid var(--border)",
                color: "var(--foreground)",
                fontSize: 46,
                fontWeight: 800,
                boxShadow: "0 20px 64px rgba(0, 0, 0, 0.45)",
                transform: `scale(${badgePop})`,
              }}
            >
              <FaHandshake
                size={48}
                aria-hidden="true"
                style={{ color: "var(--warning)" }}
              />
              It's a draw
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
