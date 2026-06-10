import { FaTrophy } from "react-icons/fa6";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Board } from "../board";
import { Heading } from "../heading";

const FINAL_MOVE = 98;
const LINE_AT = 122;
const BANNER_AT = 152;

export function WinningScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bannerPop =
    frame < BANNER_AT
      ? 0
      : spring({
          frame: frame - BANNER_AT,
          fps,
          config: { damping: 11, stiffness: 160, mass: 0.9 },
        });
  return (
    <AbsoluteFill>
      <Heading
        title="Three in a row wins"
        subtitle="X completes the diagonal and takes the game"
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 180,
          gap: 52,
        }}
      >
        <Board
          cells={[
            { mark: "X", at: 18 },
            { mark: "O", at: 30 },
            null,
            null,
            { mark: "X", at: 42 },
            { mark: "O", at: 54 },
            null,
            null,
            { mark: "X", at: FINAL_MOVE },
          ]}
          size={460}
          ghosts={[{ cell: 8, mark: "X", from: 76, until: FINAL_MOVE }]}
          win={{ line: [0, 4, 8], mark: "X", at: LINE_AT }}
          glowCells={[0, 4, 8]}
          glowAt={LINE_AT + 10}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "20px 48px",
            borderRadius: 999,
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
            fontSize: 44,
            fontWeight: 800,
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.35)",
            transform: `scale(${bannerPop})`,
          }}
        >
          <FaTrophy size={40} aria-hidden="true" />X wins!
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
