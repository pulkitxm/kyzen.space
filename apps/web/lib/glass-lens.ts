const LENS_BEZEL = 34;
const LENS_CURVE = 1.6;
export const LENS_SCALE_R = 72;
export const LENS_SCALE_G = 64;
export const LENS_SCALE_B = 56;
export const LENS_MIN_SIZE = 56;
export const LENS_MAX_AREA = 600_000;

export function roundedRectSdf(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): number {
  const px = Math.abs(x - w / 2) - (w / 2 - r);
  const py = Math.abs(y - h / 2) - (h / 2 - r);
  const ax = Math.max(px, 0);
  const ay = Math.max(py, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(px, py), 0) - r;
}

export function clampCornerRadius(r: number, w: number, h: number): number {
  if (!Number.isFinite(r) || r < 0) return Math.min(16, w / 2, h / 2);
  return Math.min(r, w / 2, h / 2);
}

export function computeLensDisplacementPixels(
  w: number,
  h: number,
  radius: number,
  bezel: number = LENS_BEZEL,
  curve: number = LENS_CURVE,
): Uint8ClampedArray<ArrayBuffer> {
  const r = clampCornerRadius(radius, w, h);
  const data = new Uint8ClampedArray(w * h * 4);
  const eps = 0.75;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = -roundedRectSdf(x, y, w, h, r);
      let t = 0;
      if (d >= 0) {
        const u = 1 - Math.min(Math.max(d / bezel, 0), 1);
        const smooth = u * u * (3 - 2 * u);
        t = smooth ** curve;
      }
      const gx =
        (roundedRectSdf(x + eps, y, w, h, r) -
          roundedRectSdf(x - eps, y, w, h, r)) /
        (2 * eps);
      const gy =
        (roundedRectSdf(x, y + eps, w, h, r) -
          roundedRectSdf(x, y - eps, w, h, r)) /
        (2 * eps);
      const len = Math.hypot(gx, gy) || 1;
      const i = (y * w + x) * 4;
      data[i] = 128 - (gx / len) * t * 127;
      data[i + 1] = 128 - (gy / len) * t * 127;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}
