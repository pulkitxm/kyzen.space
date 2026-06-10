import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Board } from "../board";
import { Heading } from "../heading";
import { MarkGlyph } from "../marks";

const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

const MOVE_ONE = 60;
const MOVE_TWO = 115;
const MOVE_THREE = 170;

const SEGMENT_WIDTH = 240;

function TurnPill() {
  const frame = useCurrentFrame();
  const pillIn = interpolate(frame, [24, 48], [0, 1], {
    easing: ENTRANCE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flip = (at: number) =>
    interpolate(frame, [at + 6, at + 20], [0, 1], {
      easing: ENTRANCE,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const position = flip(MOVE_ONE) - flip(MOVE_TWO) + flip(MOVE_THREE);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        padding: 10,
        borderRadius: 999,
        backgroundColor: "var(--surface-raised)",
        border: "2px solid var(--border)",
        opacity: pillIn,
        transform: `translateY(${(1 - pillIn) * 26}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          width: SEGMENT_WIDTH,
          height: "calc(100% - 20px)",
          borderRadius: 999,
          backgroundColor: "var(--surface-overlay)",
          border: "2px solid var(--border)",
          transform: `translateX(${position * SEGMENT_WIDTH}px)`,
        }}
      />
      {(["X", "O"] as const).map((mark) => {
        const active = mark === "X" ? 1 - position : position;
        return (
          <div
            key={mark}
            style={{
              position: "relative",
              width: SEGMENT_WIDTH,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              padding: "16px 0",
              fontSize: 32,
              fontWeight: 700,
              opacity: 0.4 + active * 0.6,
            }}
          >
            <MarkGlyph mark={mark} size={42} />
            {mark}'s turn
          </div>
        );
      })}
    </div>
  );
}

export function TurnsScene() {
  return (
    <AbsoluteFill>
      <Heading
        title="Take turns - one mark per move"
        subtitle="On your turn, place your mark in any empty cell"
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 190,
          gap: 56,
        }}
      >
        <TurnPill />
        <Board
          cells={[
            { mark: "O", at: MOVE_TWO },
            null,
            { mark: "X", at: MOVE_THREE },
            null,
            { mark: "X", at: MOVE_ONE },
            null,
            null,
            null,
            null,
          ]}
          size={440}
          ghosts={[
            { cell: 4, mark: "X", from: MOVE_ONE - 22, until: MOVE_ONE },
            { cell: 0, mark: "O", from: MOVE_TWO - 22, until: MOVE_TWO },
            { cell: 2, mark: "X", from: MOVE_THREE - 22, until: MOVE_THREE },
          ]}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
