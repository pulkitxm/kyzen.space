const PI = Math.PI;
const DEG = PI / 180;
const SQRT3 = 1.7320508075688772;
const TAN_15 = 0.2679491924311227;

export function normalizeAngle(deg: number): number {
  return deg - 360 * Math.floor((deg + 180) / 360);
}

function sinPoly(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800))))))
  );
}

function cosPoly(x: number): number {
  const x2 = x * x;
  return (
    1 +
    x2 *
      (-1 / 2 +
        x2 *
          (1 / 24 +
            x2 *
              (-1 / 720 +
                x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600))))))
  );
}

export function dsin(deg: number): number {
  let d = normalizeAngle(deg);
  let sign = 1;
  if (d < 0) {
    d = -d;
    sign = -1;
  }
  if (d > 90) d = 180 - d;
  const value = d <= 45 ? sinPoly(d * DEG) : cosPoly((90 - d) * DEG);
  return sign * value + 0;
}

export function dcos(deg: number): number {
  return dsin(deg + 90);
}

function atanSmall(z: number): number {
  const z2 = z * z;
  return (
    z *
    (1 +
      z2 *
        (-1 / 3 +
          z2 *
            (1 / 5 +
              z2 * (-1 / 7 + z2 * (1 / 9 + z2 * (-1 / 11 + z2 * (1 / 13)))))))
  );
}

function atanUnit(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const a = z * sign;
  if (a <= TAN_15) return sign * atanSmall(a);
  return sign * (PI / 6 + atanSmall((a * SQRT3 - 1) / (SQRT3 + a)));
}

export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  let radians: number;
  if (Math.abs(y) <= Math.abs(x)) {
    radians = atanUnit(y / x);
    if (x < 0) radians += y < 0 ? -PI : PI;
  } else {
    radians = (y > 0 ? PI / 2 : -PI / 2) - atanUnit(x / y);
  }
  return normalizeAngle(radians / DEG);
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000 + 0;
}

export function wrapX(x: number, width: number): number {
  const wrapped = x - width * Math.floor(x / width);
  return wrapped >= width ? wrapped - width : wrapped;
}

export function ceilDiv(value: number, divisor: number): number {
  return -Math.floor(-value / divisor);
}

export function wrapDelta(from: number, to: number, width: number): number {
  const d = to - from;
  const half = width / 2;
  if (d > half) return d - width * ceilDiv(d - half, width);
  if (d < -half) return d + width * ceilDiv(-half - d, width);
  return d;
}

export function hashValues(values: readonly (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const value of values) {
    if (typeof value === "number") {
      h = Math.imul(h ^ (value | 0), 0x01000193);
      h = Math.imul(h ^ ((value / 4294967296) | 0), 0x01000193);
    } else {
      for (let i = 0; i < value.length; i++)
        h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
    }
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveRng(...parts: (number | string)[]): Rng {
  return mulberry32(hashValues(parts));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
