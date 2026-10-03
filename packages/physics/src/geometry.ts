import type { AABB, Body, BoxShape, CircleShape } from "./types";

export function wrapX(x: number, width: number): number {
  const wrapped = x - width * Math.floor(x / width);
  return wrapped >= width ? wrapped - width : wrapped;
}

export function wrapDelta(from: number, to: number, width: number): number {
  const d = to - from;
  const half = width / 2;
  if (d > half) return d - width * Math.ceil((d - half) / width);
  if (d < -half) return d + width * Math.ceil((-half - d) / width);
  return d;
}

export function boxAABB(x: number, y: number, shape: BoxShape): AABB {
  return {
    minX: x - shape.halfWidth,
    minY: y - shape.halfHeight,
    maxX: x + shape.halfWidth,
    maxY: y + shape.halfHeight,
  };
}

export function circleAABB(x: number, y: number, shape: CircleShape): AABB {
  return {
    minX: x - shape.radius,
    minY: y - shape.radius,
    maxX: x + shape.radius,
    maxY: y + shape.radius,
  };
}

export function bodyAABB(body: Body): AABB {
  const shape = body.shape;
  if (shape.type === "box") return boxAABB(body.x, body.y, shape);
  if (shape.type === "circle") return circleAABB(body.x, body.y, shape);
  return {
    minX: Math.min(shape.x0, shape.x1),
    minY: Math.min(shape.y0, shape.y1),
    maxX: Math.max(shape.x0, shape.x1),
    maxY: Math.max(shape.y0, shape.y1),
  };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
  );
}

export function pointInBox(
  px: number,
  py: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): boolean {
  return px >= bx - hw && px <= bx + hw && py >= by - hh && py <= by + hh;
}

export function boxDistance(
  px: number,
  py: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): number {
  const dx = Math.max(Math.abs(px - bx) - hw, 0);
  const dy = Math.max(Math.abs(py - by) - hh, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function boxTouchesCircle(
  bx: number,
  by: number,
  hw: number,
  hh: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const qx = Math.min(Math.max(cx, bx - hw), bx + hw);
  const qy = Math.min(Math.max(cy, by - hh), by + hh);
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy < r * r;
}

export function circlesTouching(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const rSum = r1 + r2;
  return dx * dx + dy * dy < rSum * rSum;
}

export function sweepBoxVsBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  hw1: number,
  hh1: number,
  bx: number,
  by: number,
  hw2: number,
  hh2: number,
): number {
  const minX = bx - hw2 - hw1;
  const maxX = bx + hw2 + hw1;
  const minY = by - hh2 - hh1;
  const maxY = by + hh2 + hh1;

  let t0 = 0;
  let t1 = 1;

  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let a = (minX - x0) / dx;
    let b = (maxX - x0) / dx;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }

  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    let a = (minY - y0) / dy;
    let b = (maxY - y0) / dy;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }

  return t0;
}

export function sweepPointVsBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let t0 = 0;
  let t1 = 1;

  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let a = (minX - x0) / dx;
    let b = (maxX - x0) / dx;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }

  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    let a = (minY - y0) / dy;
    let b = (maxY - y0) / dy;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }

  return t0;
}

export function sweepCircleVsCircle(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  r1: number,
  cx: number,
  cy: number,
  r2: number,
  insideHits: boolean,
): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const r = r1 + r2;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return insideHits ? 0 : -1;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export function sweepCircleVsBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  r: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): number {
  return sweepPointVsBox(
    x0,
    y0,
    dx,
    dy,
    bx - hw - r,
    by - hh - r,
    bx + hw + r,
    by + hh + r,
  );
}

export function sweepPointVsSegment(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const ex = bx - ax;
  const ey = by - ay;
  const denom = dx * ey - dy * ex;
  if (denom === 0) return -1;
  const t = ((ax - x0) * ey - (ay - y0) * ex) / denom;
  const u = ((ax - x0) * dy - (ay - y0) * dx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

export function lineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  boxes: readonly { x: number; y: number; hw: number; hh: number }[],
  inset: number = 0.01,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const box of boxes) {
    if (
      sweepPointVsBox(
        x0,
        y0,
        dx,
        dy,
        box.x - box.hw + inset,
        box.y - box.hh + inset,
        box.x + box.hw - inset,
        box.y + box.hh - inset,
      ) >= 0
    )
      return false;
  }
  return true;
}

export function normalize(vx: number, vy: number): { x: number; y: number } {
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: vx / len, y: vy / len };
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function reflect(
  vx: number,
  vy: number,
  nx: number,
  ny: number,
): { x: number; y: number } {
  const d = 2 * dot(vx, vy, nx, ny);
  return { x: vx - d * nx, y: vy - d * ny };
}
