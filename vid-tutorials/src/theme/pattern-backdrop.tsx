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
      className="vt-pattern-backdrop"
      style={{
        WebkitMaskImage: maskUrl,
        maskImage: maskUrl,
        WebkitMaskSize: maskSize,
        maskSize,
        ...style,
      }}
    />
  );
};
