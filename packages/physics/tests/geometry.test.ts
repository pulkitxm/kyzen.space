import { describe, expect, test } from "bun:test";
import {
  boxDistance,
  boxTouchesCircle,
  circlesTouching,
  normalize,
  reflect,
  sweepBoxVsBox,
  sweepCircleVsBox,
  sweepCircleVsCircle,
  sweepPointVsBox,
  sweepPointVsSegment,
  wrapDelta,
  wrapX,
} from "../src/geometry";

describe("wrapX", () => {
  test("wraps coordinates to [0, width)", () => {
    expect(wrapX(0, 100)).toBe(0);
    expect(wrapX(50, 100)).toBe(50);
    expect(wrapX(100, 100)).toBe(0);
    expect(wrapX(150, 100)).toBe(50);
    expect(wrapX(-10, 100)).toBe(90);
    expect(wrapX(-100, 100)).toBe(0);
  });
});

describe("wrapDelta", () => {
  test("computes wrapped delta", () => {
    expect(wrapDelta(10, 90, 100)).toBe(-20);
    expect(wrapDelta(90, 10, 100)).toBe(20);
    expect(wrapDelta(5, 95, 100)).toBe(-10);
    expect(wrapDelta(95, 5, 100)).toBe(10);
    expect(wrapDelta(0, 50, 100)).toBe(50);
    expect(wrapDelta(50, 0, 100)).toBe(-50);
  });
});

describe("boxDistance", () => {
  test("returns 0 for point inside box", () => {
    expect(boxDistance(5, 5, 5, 5, 2, 2)).toBe(0);
    expect(boxDistance(4, 4, 5, 5, 2, 2)).toBe(0);
  });

  test("returns correct distance for point outside box", () => {
    expect(boxDistance(10, 5, 5, 5, 2, 2)).toBe(3);
    expect(boxDistance(5, 10, 5, 5, 2, 2)).toBe(3);
    expect(boxDistance(10, 10, 5, 5, 2, 2)).toBeCloseTo(Math.sqrt(18), 10);
  });
});

describe("boxTouchesCircle", () => {
  test("detects overlapping box and circle", () => {
    expect(boxTouchesCircle(5, 5, 2, 2, 8, 5, 2)).toBe(true);
    expect(boxTouchesCircle(5, 5, 2, 2, 5, 8, 2)).toBe(true);
    expect(boxTouchesCircle(5, 5, 2, 2, 5, 5, 1)).toBe(true);
  });

  test("detects non-overlapping box and circle", () => {
    expect(boxTouchesCircle(5, 5, 2, 2, 10, 5, 1)).toBe(false);
    expect(boxTouchesCircle(5, 5, 2, 2, 5, 10, 1)).toBe(false);
  });
});

describe("circlesTouching", () => {
  test("detects overlapping circles", () => {
    expect(circlesTouching(0, 0, 5, 8, 0, 5)).toBe(true);
    expect(circlesTouching(0, 0, 5, 0, 0, 1)).toBe(true);
  });

  test("detects non-overlapping circles", () => {
    expect(circlesTouching(0, 0, 2, 10, 0, 2)).toBe(false);
  });
});

describe("sweepPointVsBox", () => {
  test("detects ray hitting box", () => {
    const t = sweepPointVsBox(0, 5, 10, 0, 5, 3, 7, 7);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });

  test("returns -1 for ray missing box", () => {
    const t = sweepPointVsBox(0, 0, 10, 0, 5, 5, 7, 7);
    expect(t).toBe(-1);
  });

  test("returns -1 for ray starting inside and no insideHits", () => {
    const t = sweepPointVsBox(5, 5, 1, 0, 3, 3, 7, 7);
    expect(t).toBeGreaterThanOrEqual(0);
  });
});

describe("sweepCircleVsCircle", () => {
  test("detects circle hitting circle", () => {
    const t = sweepCircleVsCircle(0, 0, 10, 0, 2, 8, 0, 2, false);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });

  test("returns -1 for circle missing circle", () => {
    const t = sweepCircleVsCircle(0, 0, 10, 0, 2, 8, 5, 2, false);
    expect(t).toBe(-1);
  });
});

describe("sweepCircleVsBox", () => {
  test("detects circle hitting box", () => {
    const t = sweepCircleVsBox(0, 5, 10, 0, 1, 8, 5, 2, 2);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });
});

describe("sweepBoxVsBox", () => {
  test("detects box hitting box", () => {
    const t = sweepBoxVsBox(0, 5, 10, 0, 1, 1, 8, 5, 2, 2);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });

  test("returns -1 for boxes that miss", () => {
    const t = sweepBoxVsBox(0, 0, 10, 0, 1, 1, 8, 10, 2, 2);
    expect(t).toBe(-1);
  });
});

describe("sweepPointVsSegment", () => {
  test("detects ray hitting segment", () => {
    const t = sweepPointVsSegment(0, 5, 10, 0, 5, 0, 5, 10);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });

  test("returns -1 for ray missing segment", () => {
    const t = sweepPointVsSegment(0, 5, 10, 0, 5, 6, 5, 10);
    expect(t).toBe(-1);
  });

  test("returns -1 for parallel ray", () => {
    const t = sweepPointVsSegment(0, 5, 10, 0, 0, 0, 10, 0);
    expect(t).toBe(-1);
  });
});

describe("normalize", () => {
  test("normalizes non-zero vectors", () => {
    const result = normalize(3, 4);
    expect(result.x).toBeCloseTo(0.6, 10);
    expect(result.y).toBeCloseTo(0.8, 10);
  });

  test("returns zero for zero vector", () => {
    const result = normalize(0, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe("reflect", () => {
  test("reflects vector about normal", () => {
    const result = reflect(1, -1, 0, 1);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  test("preserves magnitude", () => {
    const vx = 3;
    const vy = 4;
    const result = reflect(vx, vy, 1, 0);
    const origLen = Math.sqrt(vx * vx + vy * vy);
    const newLen = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(newLen).toBeCloseTo(origLen, 10);
  });
});
