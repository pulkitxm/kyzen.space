import type { SceneFrame } from "./view";

export const CAMERA_FOV = 38;
export const EDGE_MARGIN = 2.5;
export const MIN_VISIBLE_HEIGHT = 24;
export const MAX_VISIBLE_HEIGHT = 44;
const MAX_VISIBLE_WIDTH = 74;
export const CAMERA_LIFT = 3.2;
const FOCUS_ANCHOR = 0.35;
export const MAX_INSET = 0.45;

export function clampInset(fraction: number) {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(MAX_INSET, Math.max(0, fraction));
}

export type CameraFraming = {
  x: number;
  y: number;
  distance: number;
  visibleWidth: number;
  visibleHeight: number;
};

export function visibleExtent(worldWidth: number, aspect: number) {
  const span = worldWidth + EDGE_MARGIN * 2;
  const safeAspect = Math.max(0.3, aspect);
  let visibleWidth = Math.min(span, MAX_VISIBLE_WIDTH);
  let visibleHeight = visibleWidth / safeAspect;
  if (visibleHeight < MIN_VISIBLE_HEIGHT) {
    visibleHeight = MIN_VISIBLE_HEIGHT;
    visibleWidth = visibleHeight * safeAspect;
  }
  if (visibleHeight > MAX_VISIBLE_HEIGHT) {
    visibleHeight = MAX_VISIBLE_HEIGHT;
    visibleWidth = visibleHeight * safeAspect;
  }
  return { visibleWidth, visibleHeight };
}

export function frameCamera(input: {
  focusX: number;
  focusY: number;
  worldWidth: number;
  waterY: number;
  aspect: number;
  fov?: number;
  insetTop?: number;
  insetBottom?: number;
}): CameraFraming {
  const fov = ((input.fov ?? CAMERA_FOV) * Math.PI) / 180;
  const { visibleWidth, visibleHeight } = visibleExtent(
    input.worldWidth,
    input.aspect,
  );
  const distance = visibleHeight / 2 / Math.tan(fov / 2);
  const span = input.worldWidth + EDGE_MARGIN * 2;
  const half = visibleWidth / 2;
  const x =
    visibleWidth >= span
      ? input.worldWidth / 2
      : Math.min(
          Math.max(input.focusX, -EDGE_MARGIN + half),
          input.worldWidth + EDGE_MARGIN - half,
        );
  const bottom = clampInset(input.insetBottom ?? 0);
  const top = 1 - clampInset(input.insetTop ?? 0);
  const usableTop = Math.max(bottom + 0.2, top);
  const anchor = bottom + (usableTop - bottom) * FOCUS_ANCHOR;
  const waterLine =
    input.waterY - 1 + visibleHeight / 2 - bottom * visibleHeight;
  const focusLine = input.focusY + visibleHeight / 2 - anchor * visibleHeight;
  const y = Math.max(waterLine, focusLine);
  return { x, y, distance, visibleWidth, visibleHeight };
}

export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export function wrappedDelta(from: number, to: number, width: number) {
  let delta = to - from;
  if (width <= 0) return delta;
  while (delta > width / 2) delta -= width;
  while (delta < -width / 2) delta += width;
  return delta;
}

export function actionFocus(
  frame: SceneFrame,
  width: number,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  const points: { x: number; y: number }[] = [];
  for (const projectile of frame.projectiles) {
    points.push({ x: projectile.x, y: projectile.y });
  }
  if (points.length === 0) {
    for (const tank of frame.tanks) {
      if (!tank.alive) continue;
      if (Math.abs(tank.vx) + Math.abs(tank.vy) > 1.5) {
        points.push({ x: tank.x, y: tank.y + tank.height / 2 });
      }
    }
  }
  const first = points[0];
  if (!first) return fallback;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += wrappedDelta(first.x, point.x, width);
    sumY += point.y;
  }
  let x = first.x + sumX / points.length;
  if (width > 0) x = ((x % width) + width) % width;
  return { x, y: sumY / points.length };
}

export function needsMinimap(worldWidth: number, aspect: number) {
  const { visibleWidth } = visibleExtent(worldWidth, aspect);
  return visibleWidth < worldWidth + EDGE_MARGIN * 2 - 0.5;
}
