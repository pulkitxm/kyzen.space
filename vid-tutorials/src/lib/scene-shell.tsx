import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const SCENE_FADE_FRAMES = 12;

type SceneShellProps = {
  duration: number;
  children: ReactNode;
};

export const SceneShell = ({ duration, children }: SceneShellProps) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [duration - SCENE_FADE_FRAMES, duration - 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
