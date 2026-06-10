import type { CSSProperties } from "react";
import { AbsoluteFill, staticFile } from "remotion";

type PatternBackdropProps = {
  pattern?: string;
  tile?: number;
  style?: CSSProperties;
};

export const PatternBackdrop = ({
  pattern = "doodles",
  tile = 480,
  style,
}: PatternBackdropProps) => {
  const maskUrl = `url(${staticFile(`patterns/${pattern}.svg`)})`;
  const maskSize = `${tile}px ${tile}px`;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "var(--pattern-ink)",
        opacity: "var(--pattern-opacity)" as CSSProperties["opacity"],
        WebkitMaskImage: maskUrl,
        maskImage: maskUrl,
        WebkitMaskRepeat: "repeat",
        maskRepeat: "repeat",
        WebkitMaskSize: maskSize,
        maskSize: maskSize,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
};
