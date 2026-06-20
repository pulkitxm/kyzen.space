import "./theme/theme.css";
import { Composition } from "remotion";
import {
  FPS,
  MAX_TUTORIAL_SECONDS,
  MIN_TUTORIAL_SECONDS,
  sec,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./lib/video";
import { TUTORIALS, type TutorialEntry } from "./tutorials/registry";

function boundedDuration(tutorial: TutorialEntry): number {
  if (
    tutorial.durationInFrames < sec(MIN_TUTORIAL_SECONDS) ||
    tutorial.durationInFrames > sec(MAX_TUTORIAL_SECONDS)
  ) {
    throw new Error(
      `Tutorial "${tutorial.id}" is ${tutorial.durationInFrames / FPS}s; it must be ${MIN_TUTORIAL_SECONDS}-${MAX_TUTORIAL_SECONDS}s`,
    );
  }
  return tutorial.durationInFrames;
}

export const RemotionRoot = () => {
  return (
    <>
      {TUTORIALS.map((tutorial) => (
        <Composition
          key={tutorial.id}
          id={tutorial.id}
          component={tutorial.component}
          durationInFrames={boundedDuration(tutorial)}
          fps={FPS}
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
        />
      ))}
    </>
  );
};
