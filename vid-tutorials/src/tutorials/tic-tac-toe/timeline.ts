export const SCENE_FRAMES = {
  title: 126,
  goal: 194,
  setup: 196,
  turns: 240,
  winning: 224,
  draw: 204,
  outro: 120,
};

export const TIC_TAC_TOE_TUTORIAL_FRAMES = Object.values(SCENE_FRAMES).reduce(
  (total, frames) => total + frames,
  0,
);
