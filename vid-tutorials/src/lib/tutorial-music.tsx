import { DEFAULT_MUSIC_VOLUME } from "@gamelobby/shared/constants";
import { Audio } from "@remotion/media";
import { interpolate, staticFile, useVideoConfig } from "remotion";

type TutorialMusicProps = {
  src: string;
  volume?: number;
};

export const TutorialMusic = ({
  src,
  volume = DEFAULT_MUSIC_VOLUME,
}: TutorialMusicProps) => {
  const { durationInFrames, fps } = useVideoConfig();
  const fadeIn = Math.min(fps, durationInFrames / 4);
  const fadeOut = Math.min(2 * fps, durationInFrames / 4);
  return (
    <Audio
      loop
      loopVolumeCurveBehavior="extend"
      src={staticFile(src)}
      volume={(frame) =>
        interpolate(
          frame,
          [0, fadeIn, durationInFrames - fadeOut, durationInFrames - 1],
          [0, volume, volume, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      }
    />
  );
};
