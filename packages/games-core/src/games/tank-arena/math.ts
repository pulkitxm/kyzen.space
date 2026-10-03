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

function hashValues(values: readonly (number | string)[]): number {
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

const SECRET_WORDS = 8;
const STRETCH_BLOCKS = 32_768;

export function chachaBlock(
  key: readonly number[],
  counter: number,
  nonce0: number,
  nonce1: number,
  nonce2: number,
): number[] {
  const i0 = 0x61707865;
  const i1 = 0x3320646e;
  const i2 = 0x79622d32;
  const i3 = 0x6b206574;
  const i4 = (key[0] ?? 0) | 0;
  const i5 = (key[1] ?? 0) | 0;
  const i6 = (key[2] ?? 0) | 0;
  const i7 = (key[3] ?? 0) | 0;
  const i8 = (key[4] ?? 0) | 0;
  const i9 = (key[5] ?? 0) | 0;
  const i10 = (key[6] ?? 0) | 0;
  const i11 = (key[7] ?? 0) | 0;
  const i12 = counter | 0;
  const i13 = nonce0 | 0;
  const i14 = nonce1 | 0;
  const i15 = nonce2 | 0;
  let x0 = i0;
  let x1 = i1;
  let x2 = i2;
  let x3 = i3;
  let x4 = i4;
  let x5 = i5;
  let x6 = i6;
  let x7 = i7;
  let x8 = i8;
  let x9 = i9;
  let x10 = i10;
  let x11 = i11;
  let x12 = i12;
  let x13 = i13;
  let x14 = i14;
  let x15 = i15;
  for (let round = 0; round < 10; round++) {
    x0 = (x0 + x4) | 0;
    x12 ^= x0;
    x12 = (x12 << 16) | (x12 >>> 16);
    x8 = (x8 + x12) | 0;
    x4 ^= x8;
    x4 = (x4 << 12) | (x4 >>> 20);
    x0 = (x0 + x4) | 0;
    x12 ^= x0;
    x12 = (x12 << 8) | (x12 >>> 24);
    x8 = (x8 + x12) | 0;
    x4 ^= x8;
    x4 = (x4 << 7) | (x4 >>> 25);
    x1 = (x1 + x5) | 0;
    x13 ^= x1;
    x13 = (x13 << 16) | (x13 >>> 16);
    x9 = (x9 + x13) | 0;
    x5 ^= x9;
    x5 = (x5 << 12) | (x5 >>> 20);
    x1 = (x1 + x5) | 0;
    x13 ^= x1;
    x13 = (x13 << 8) | (x13 >>> 24);
    x9 = (x9 + x13) | 0;
    x5 ^= x9;
    x5 = (x5 << 7) | (x5 >>> 25);
    x2 = (x2 + x6) | 0;
    x14 ^= x2;
    x14 = (x14 << 16) | (x14 >>> 16);
    x10 = (x10 + x14) | 0;
    x6 ^= x10;
    x6 = (x6 << 12) | (x6 >>> 20);
    x2 = (x2 + x6) | 0;
    x14 ^= x2;
    x14 = (x14 << 8) | (x14 >>> 24);
    x10 = (x10 + x14) | 0;
    x6 ^= x10;
    x6 = (x6 << 7) | (x6 >>> 25);
    x3 = (x3 + x7) | 0;
    x15 ^= x3;
    x15 = (x15 << 16) | (x15 >>> 16);
    x11 = (x11 + x15) | 0;
    x7 ^= x11;
    x7 = (x7 << 12) | (x7 >>> 20);
    x3 = (x3 + x7) | 0;
    x15 ^= x3;
    x15 = (x15 << 8) | (x15 >>> 24);
    x11 = (x11 + x15) | 0;
    x7 ^= x11;
    x7 = (x7 << 7) | (x7 >>> 25);
    x0 = (x0 + x5) | 0;
    x15 ^= x0;
    x15 = (x15 << 16) | (x15 >>> 16);
    x10 = (x10 + x15) | 0;
    x5 ^= x10;
    x5 = (x5 << 12) | (x5 >>> 20);
    x0 = (x0 + x5) | 0;
    x15 ^= x0;
    x15 = (x15 << 8) | (x15 >>> 24);
    x10 = (x10 + x15) | 0;
    x5 ^= x10;
    x5 = (x5 << 7) | (x5 >>> 25);
    x1 = (x1 + x6) | 0;
    x12 ^= x1;
    x12 = (x12 << 16) | (x12 >>> 16);
    x11 = (x11 + x12) | 0;
    x6 ^= x11;
    x6 = (x6 << 12) | (x6 >>> 20);
    x1 = (x1 + x6) | 0;
    x12 ^= x1;
    x12 = (x12 << 8) | (x12 >>> 24);
    x11 = (x11 + x12) | 0;
    x6 ^= x11;
    x6 = (x6 << 7) | (x6 >>> 25);
    x2 = (x2 + x7) | 0;
    x13 ^= x2;
    x13 = (x13 << 16) | (x13 >>> 16);
    x8 = (x8 + x13) | 0;
    x7 ^= x8;
    x7 = (x7 << 12) | (x7 >>> 20);
    x2 = (x2 + x7) | 0;
    x13 ^= x2;
    x13 = (x13 << 8) | (x13 >>> 24);
    x8 = (x8 + x13) | 0;
    x7 ^= x8;
    x7 = (x7 << 7) | (x7 >>> 25);
    x3 = (x3 + x4) | 0;
    x14 ^= x3;
    x14 = (x14 << 16) | (x14 >>> 16);
    x9 = (x9 + x14) | 0;
    x4 ^= x9;
    x4 = (x4 << 12) | (x4 >>> 20);
    x3 = (x3 + x4) | 0;
    x14 ^= x3;
    x14 = (x14 << 8) | (x14 >>> 24);
    x9 = (x9 + x14) | 0;
    x4 ^= x9;
    x4 = (x4 << 7) | (x4 >>> 25);
  }
  return [
    (x0 + i0) >>> 0,
    (x1 + i1) >>> 0,
    (x2 + i2) >>> 0,
    (x3 + i3) >>> 0,
    (x4 + i4) >>> 0,
    (x5 + i5) >>> 0,
    (x6 + i6) >>> 0,
    (x7 + i7) >>> 0,
    (x8 + i8) >>> 0,
    (x9 + i9) >>> 0,
    (x10 + i10) >>> 0,
    (x11 + i11) >>> 0,
    (x12 + i12) >>> 0,
    (x13 + i13) >>> 0,
    (x14 + i14) >>> 0,
    (x15 + i15) >>> 0,
  ];
}

export function deriveSecret(seed: number): number[] {
  let key = [seed >>> 0, Math.floor(seed / 4294967296) >>> 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < STRETCH_BLOCKS; i++)
    key = chachaBlock(key, i, 0x74616e6b, 0, 0).slice(0, SECRET_WORDS);
  return key;
}

export function secretWord(
  secret: readonly number[],
  ...parts: (number | string)[]
): number {
  return (
    chachaBlock(
      secret,
      hashValues(parts),
      hashValues(["kyzen", ...parts]),
      parts.length,
      1,
    )[0] ?? 0
  );
}

export function secretRng(
  secret: readonly number[],
  ...parts: (number | string)[]
): Rng {
  return mulberry32(secretWord(secret, ...parts));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
