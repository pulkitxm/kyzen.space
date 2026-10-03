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

export function sweepPointBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let enter = 0;
  let exit = 1;
  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let a = (minX - x0) / dx;
    let b = (maxX - x0) / dx;
    if (a > b) {
      const swap = a;
      a = b;
      b = swap;
    }
    if (a > enter) enter = a;
    if (b < exit) exit = b;
    if (enter > exit) return -1;
  }
  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    let a = (minY - y0) / dy;
    let b = (maxY - y0) / dy;
    if (a > b) {
      const swap = a;
      a = b;
      b = swap;
    }
    if (a > enter) enter = a;
    if (b < exit) exit = b;
    if (enter > exit) return -1;
  }
  return enter;
}

export function sweepPointCircle(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
  insideHits: boolean,
): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return insideHits ? 0 : -1;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export function sweepPointSegment(
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
  radius: number,
): boolean {
  const qx = Math.min(Math.max(cx, bx - hw), bx + hw);
  const qy = Math.min(Math.max(cy, by - hh), by + hh);
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy < radius * radius;
}

export function boxesOverlap(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  bx: number,
  by: number,
  bhw: number,
  bhh: number,
): boolean {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}
