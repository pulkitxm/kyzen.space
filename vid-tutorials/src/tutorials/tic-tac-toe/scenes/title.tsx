import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MarkGlyph } from "../marks";

const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (at: number) =>
    frame < at
      ? 0
      : spring({
          frame: frame - at,
          fps,
          config: { damping: 11, stiffness: 150, mass: 0.9 },
        });
  const reveal = (at: number) =>
    interpolate(frame, [at, at + 26], [0, 1], {
      easing: ENTRANCE,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const xIn = pop(8);
  const oIn = pop(18);
  const titleIn = reveal(12);
  const subtitleIn = reveal(36);
  const chipIn = reveal(58);
  const bob = Math.sin(frame / 22) * 7;
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 44,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 72 }}>
        <MarkGlyph
          mark="X"
          size={190}
          style={{ transform: `scale(${xIn}) translateY(${bob}px)` }}
        />
        <div
          style={{
            fontSize: 136,
            fontWeight: 800,
            letterSpacing: -4,
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * 56}px)`,
          }}
        >
          Tic-tac-toe
        </div>
        <MarkGlyph
          mark="O"
          size={190}
          style={{ transform: `scale(${oIn}) translateY(${-bob}px)` }}
        />
      </div>
      <div
        style={{
          fontSize: 42,
          color: "var(--muted-foreground)",
          opacity: subtitleIn,
          transform: `translateY(${(1 - subtitleIn) * 30}px)`,
        }}
      >
        The classic three-in-a-row duel
      </div>
      <div
        className="ttt-title-chip"
        style={{
          opacity: chipIn,
          transform: `translateY(${(1 - chipIn) * 24}px)`,
        }}
      >
        2 players · turn-based · 3×3 board
      </div>
    </AbsoluteFill>
  );
}
