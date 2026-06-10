import type { TutorialChapter } from "../../lib/video";

export const SCENE_FRAMES = {
  title: 126,
  goal: 194,
  setup: 196,
  turns: 240,
  winning: 224,
  draw: 204,
  outro: 120,
};

export const TIC_TAC_TOE_CHAPTERS: readonly TutorialChapter[] = [
  { label: "Intro", durationInFrames: SCENE_FRAMES.title },
  { label: "The goal", durationInFrames: SCENE_FRAMES.goal },
  { label: "Board & players", durationInFrames: SCENE_FRAMES.setup },
  { label: "Taking turns", durationInFrames: SCENE_FRAMES.turns },
  { label: "Winning", durationInFrames: SCENE_FRAMES.winning },
  { label: "The draw", durationInFrames: SCENE_FRAMES.draw },
  { label: "Play now", durationInFrames: SCENE_FRAMES.outro },
];

export const TIC_TAC_TOE_TUTORIAL_FRAMES = TIC_TAC_TOE_CHAPTERS.reduce(
  (total, chapter) => total + chapter.durationInFrames,
  0,
);
