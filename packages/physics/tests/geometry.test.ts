import { describe, expect, test } from "bun:test";
import {
  boxDistance,
  boxesOverlap,
  boxTouchesCircle,
  sweepPointBox,
  sweepPointCircle,
  sweepPointSegment,
  wrapDelta,
  wrapX,
} from "../src/geometry";

describe("wrapping", () => {
  test("wrapX maps every x into [0, width)", () => {
    expect(wrapX(0, 100)).toBe(0);
    expect(wrapX(100, 100)).toBe(0);
    expect(wrapX(150, 100)).toBe(50);
    expect(wrapX(-10, 100)).toBe(90);
    expect(wrapX(-1e-17, 100)).toBeLessThan(100);
  });

  test("wrapDelta takes the shortest way around", () => {
    expect(wrapDelta(10, 90, 100)).toBe(-20);
    expect(wrapDelta(95, 5, 100)).toBe(10);
    expect(wrapDelta(0, 50, 100)).toBe(50);
    expect(wrapDelta(5, 395, 100)).toBe(-10);
  });
});

describe("point sweeps", () => {
  test("a box is entered at the near face", () => {
    expect(sweepPointBox(0, 1, 10, 0, 4, 0, 6, 2)).toBe(0.4);
    expect(sweepPointBox(0, 5, 10, 0, 4, 0, 6, 2)).toBe(-1);
    expect(sweepPointBox(5, 1, 10, 0, 4, 0, 6, 2)).toBe(0);
    expect(sweepPointBox(0, 1, 3, 0, 4, 0, 6, 2)).toBe(-1);
  });

  test("solid circles ignore a start inside, sensors report it", () => {
    expect(sweepPointCircle(0, 0, 10, 0, 5, 0, 1, false)).toBeCloseTo(0.4, 12);
    expect(sweepPointCircle(5, 0, 10, 0, 5, 0, 1, false)).toBe(-1);
    expect(sweepPointCircle(5, 0, 10, 0, 5, 0, 1, true)).toBe(0);
    expect(sweepPointCircle(0, 3, 10, 0, 5, 0, 1, true)).toBe(-1);
  });

  test("segments are crossed from either side and parallel rays miss", () => {
    expect(sweepPointSegment(0, 0, 10, 0, 5, -1, 5, 1)).toBe(0.5);
    expect(sweepPointSegment(10, 0, -10, 0, 5, -1, 5, 1)).toBe(0.5);
    expect(sweepPointSegment(0, 0, 10, 0, 0, 1, 10, 1)).toBe(-1);
    expect(sweepPointSegment(0, 5, 10, 0, 5, -1, 5, 1)).toBe(-1);
  });
});

describe("overlaps and distances", () => {
  test("boxDistance measures to the nearest point of the box", () => {
    expect(boxDistance(5, 5, 5, 5, 2, 2)).toBe(0);
    expect(boxDistance(10, 5, 5, 5, 2, 2)).toBe(3);
    expect(boxDistance(10, 10, 5, 5, 2, 2)).toBeCloseTo(Math.sqrt(18), 12);
  });

  test("touching tests are strict at the boundary", () => {
    expect(boxTouchesCircle(5, 5, 2, 2, 8, 5, 1.5)).toBe(true);
    expect(boxTouchesCircle(5, 5, 2, 2, 8, 5, 1)).toBe(false);
    expect(boxesOverlap(0, 0, 1, 1, 1.9, 0, 1, 1)).toBe(true);
    expect(boxesOverlap(0, 0, 1, 1, 2, 0, 1, 1)).toBe(false);
  });
});
