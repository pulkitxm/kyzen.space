import { describe, expect, test } from "bun:test";
import {
  chachaBlock,
  clamp,
  datan2,
  dcos,
  deriveRng,
  deriveSecret,
  dsin,
  normalizeAngle,
  round4,
  secretRng,
  secretWord,
} from "../src/math";

describe("normalizeAngle", () => {
  test("normalizes angles to [-180, 180)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(180)).toBe(-180);
    expect(normalizeAngle(-180)).toBe(-180);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-360)).toBe(0);
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(450)).toBe(90);
  });
});

describe("dsin and dcos", () => {
  test("polynomial sin matches key angles", () => {
    expect(dsin(0)).toBeCloseTo(0, 10);
    expect(dsin(30)).toBeCloseTo(0.5, 6);
    expect(dsin(45)).toBeCloseTo(Math.sqrt(2) / 2, 6);
    expect(dsin(90)).toBeCloseTo(1, 10);
    expect(dsin(-90)).toBeCloseTo(-1, 10);
    expect(dsin(180)).toBeCloseTo(0, 10);
  });

  test("polynomial cos matches key angles", () => {
    expect(dcos(0)).toBeCloseTo(1, 10);
    expect(dcos(60)).toBeCloseTo(0.5, 6);
    expect(dcos(90)).toBeCloseTo(0, 10);
    expect(dcos(180)).toBeCloseTo(-1, 10);
    expect(dcos(-90)).toBeCloseTo(0, 10);
  });

  test("sin and cos are consistent", () => {
    for (const angle of [-135, -45, 0, 30, 45, 60, 90, 120, 150, 180]) {
      const s = dsin(angle);
      const c = dcos(angle);
      expect(s * s + c * c).toBeCloseTo(1, 8);
    }
  });
});

describe("datan2", () => {
  test("matches key angles", () => {
    expect(datan2(0, 1)).toBeCloseTo(0, 4);
    expect(datan2(1, 0)).toBeCloseTo(90, 4);
    expect(Math.abs(datan2(0, -1))).toBeCloseTo(180, 4);
    expect(datan2(-1, 0)).toBeCloseTo(-90, 4);
    expect(datan2(1, 1)).toBeCloseTo(45, 4);
    expect(datan2(-1, -1)).toBeCloseTo(-135, 4);
  });

  test("handles origin", () => {
    expect(datan2(0, 0)).toBe(0);
  });
});

describe("round4", () => {
  test("rounds to 4 decimal places", () => {
    expect(round4(1.23456789)).toBe(1.2346);
    expect(round4(-0.000012)).toBe(0);
    expect(round4(100.00005)).toBe(100.0001);
  });

  test("normalizes -0 to 0", () => {
    expect(Object.is(round4(-0.000001), -0)).toBe(false);
    expect(round4(-0.000001)).toBe(0);
  });
});

describe("clamp", () => {
  test("clamps values to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("deriveRng", () => {
  test("produces deterministic sequences", () => {
    const rng1 = deriveRng(123, "test");
    const rng2 = deriveRng(123, "test");
    expect(rng1()).toBe(rng2());
    expect(rng1()).toBe(rng2());
    expect(rng1()).toBe(rng2());
  });

  test("different seeds produce different sequences", () => {
    const rng1 = deriveRng(123, "test");
    const rng2 = deriveRng(456, "test");
    expect(rng1()).not.toBe(rng2());
  });

  test("values are in [0, 1)", () => {
    const rng = deriveRng(42);
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("chachaBlock", () => {
  test("matches RFC 7539 test vector", () => {
    const key = [
      0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514,
      0x1b1a1918, 0x1f1e1d1c,
    ];
    const result = chachaBlock(key, 1, 0x09000000, 0x4a000000, 0);
    expect(result[0]).toBe(0xe4e7f110);
    expect(result[1]).toBe(0x15593bd1);
    expect(result[15]).toBe(0x4e3c50a2);
  });
});

describe("deriveSecret", () => {
  test("produces consistent secrets", () => {
    const secret1 = deriveSecret(12345);
    const secret2 = deriveSecret(12345);
    expect(secret1).toEqual(secret2);
    expect(secret1.length).toBe(8);
  });

  test("different seeds produce different secrets", () => {
    const secret1 = deriveSecret(12345);
    const secret2 = deriveSecret(12346);
    expect(secret1).not.toEqual(secret2);
  });
});

describe("secretWord", () => {
  test("produces deterministic values", () => {
    const secret = deriveSecret(999);
    const word1 = secretWord(secret, 1, "round");
    const word2 = secretWord(secret, 1, "round");
    expect(word1).toBe(word2);
  });

  test("different parts produce different values", () => {
    const secret = deriveSecret(999);
    const word1 = secretWord(secret, 1, "round");
    const word2 = secretWord(secret, 2, "round");
    expect(word1).not.toBe(word2);
  });
});

describe("secretRng", () => {
  test("produces deterministic sequences", () => {
    const secret = deriveSecret(42);
    const rng1 = secretRng(secret, 1, "test");
    const rng2 = secretRng(secret, 1, "test");
    const values1 = [rng1(), rng1(), rng1()];
    const values2 = [rng2(), rng2(), rng2()];
    expect(values1).toEqual(values2);
  });
});

describe("cross-engine determinism", () => {
  test("math operations use only allowed functions", () => {
    const forbidden = [
      "sin",
      "cos",
      "tan",
      "atan",
      "exp",
      "log",
      "pow",
      "random",
    ];
    const mathSrc = Bun.file(
      new URL("../src/math.ts", import.meta.url).pathname,
    );
    const text = mathSrc.text();
    return text.then((content) => {
      for (const fn of forbidden) {
        const pattern = new RegExp(`Math\\.${fn}\\b`);
        expect(pattern.test(content)).toBe(false);
      }
    });
  });
});
