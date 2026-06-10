import { FaBolt } from "react-icons/fa6";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Board } from "../board";
import { Heading } from "../heading";
import { MarkGlyph, type TutorialMark } from "../marks";

const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

const EMPTY_BOARD = Array.from({ length: 9 }, () => null);

function PlayerChip({
  mark,
  at,
  fromDirection,
  badge,
  badgeAt,
}: {
  mark: TutorialMark;
  at: number;
  fromDirection: 1 | -1;
  badge?: string;
  badgeAt?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slideIn = interpolate(frame, [at, at + 26], [0, 1], {
    easing: ENTRANCE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const badgePop =
    badgeAt === undefined || frame < badgeAt
      ? 0
      : spring({
          frame: frame - badgeAt,
          fps,
          config: { damping: 11, stiffness: 170, mass: 0.8 },
        });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 26,
        opacity: slideIn,
        transform: `translateX(${(1 - slideIn) * 90 * fromDirection}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          padding: "40px 56px",
          borderRadius: 28,
          backgroundColor: "var(--card)",
          border: "2px solid var(--border)",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.3)",
        }}
      >
        <MarkGlyph mark={mark} size={104} />
        <div style={{ fontSize: 36, fontWeight: 700 }}>Player {mark}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 28px",
          borderRadius: 999,
          backgroundColor: "var(--primary)",
          color: "var(--primary-foreground)",
          fontSize: 28,
          fontWeight: 700,
          transform: `scale(${badgePop})`,
          visibility: badge ? "visible" : "hidden",
        }}
      >
        <FaBolt size={24} aria-hidden="true" />
        {badge ?? "placeholder"}
      </div>
    </div>
  );
}

export function SetupScene() {
  return (
    <AbsoluteFill>
      <Heading
        title="Two players, one 3×3 grid"
        subtitle="Nine empty cells, ready to claim"
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 170,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 120 }}>
          <PlayerChip
            mark="X"
            at={72}
            fromDirection={-1}
            badge="Moves first"
            badgeAt={126}
          />
          <Board
            cells={EMPTY_BOARD}
            size={470}
            buildStart={16}
            buildStagger={4}
          />
          <PlayerChip mark="O" at={90} fromDirection={1} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
