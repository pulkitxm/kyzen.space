export const FPS = 30;

export const VIDEO_WIDTH = 1920;

export const VIDEO_HEIGHT = 1080;

export const MIN_TUTORIAL_SECONDS = 30;

export const MAX_TUTORIAL_SECONDS = 90;

export function sec(seconds: number): number {
  return Math.round(seconds * FPS);
}
