import { Easing, interpolate, useCurrentFrame } from "remotion";

const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

export function Heading({
  title,
  subtitle,
  at = 6,
  top = 104,
}: {
  title: string;
  subtitle?: string;
  at?: number;
  top?: number;
}) {
  const frame = useCurrentFrame();
  const reveal = (delay: number) =>
    interpolate(frame, [delay, delay + 24], [0, 1], {
      easing: ENTRANCE,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const titleIn = reveal(at);
  const subtitleIn = reveal(at + 12);
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 120,
        right: 120,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: -1.5,
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 36}px)`,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 18,
            fontSize: 36,
            color: "var(--muted-foreground)",
            opacity: subtitleIn,
            transform: `translateY(${(1 - subtitleIn) * 28}px)`,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
