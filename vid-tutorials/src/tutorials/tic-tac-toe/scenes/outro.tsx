import { FaPlay } from "react-icons/fa6";
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

const CTA_AT = 44;

export function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const marksIn = (at: number) =>
    frame < at
      ? 0
      : spring({
          frame: frame - at,
          fps,
          config: { damping: 11, stiffness: 150, mass: 0.9 },
        });
  const titleIn = interpolate(frame, [14, 40], [0, 1], {
    easing: ENTRANCE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaPop =
    frame < CTA_AT
      ? 0
      : spring({
          frame: frame - CTA_AT,
          fps,
          config: { damping: 12, stiffness: 150, mass: 0.9 },
        });
  const pulse = 1 + Math.sin(Math.max(0, frame - CTA_AT - 24) / 12) * 0.015;
  const bob = Math.sin(frame / 24) * 6;
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 56,
      }}
    >
      <div style={{ display: "flex", gap: 56 }}>
        <MarkGlyph
          mark="X"
          size={130}
          style={{ transform: `scale(${marksIn(6)}) translateY(${bob}px)` }}
        />
        <MarkGlyph
          mark="O"
          size={130}
          style={{ transform: `scale(${marksIn(14)}) translateY(${-bob}px)` }}
        />
      </div>
      <div
        style={{
          fontSize: 104,
          fontWeight: 800,
          letterSpacing: -3,
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 44}px)`,
        }}
      >
        Ready to play?
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26,
          padding: "30px 64px",
          borderRadius: 999,
          backgroundColor: "var(--primary)",
          color: "var(--primary-foreground)",
          fontSize: 46,
          fontWeight: 700,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
          transform: `scale(${ctaPop * pulse})`,
        }}
      >
        <FaPlay size={38} aria-hidden="true" />
        Play Tic-tac-toe on GameLobby
      </div>
    </AbsoluteFill>
  );
}
