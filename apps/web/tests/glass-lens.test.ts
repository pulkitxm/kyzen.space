import { describe, expect, it } from "bun:test";
import {
  clampCornerRadius,
  computeLensDisplacementPixels,
  roundedRectSdf,
} from "../lib/glass-lens";

function px(
  data: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe("roundedRectSdf", () => {
  it("is negative inside, positive outside", () => {
    expect(roundedRectSdf(50, 25, 100, 50, 10)).toBeLessThan(0);
    expect(roundedRectSdf(-5, 25, 100, 50, 10)).toBeGreaterThan(0);
    expect(roundedRectSdf(1, 1, 100, 50, 10)).toBeGreaterThan(0);
  });

  it("is ~zero on the straight edge", () => {
    expect(Math.abs(roundedRectSdf(50, 0, 100, 50, 10))).toBeLessThan(0.01);
  });
});

describe("clampCornerRadius", () => {
  it("caps the radius at half the smaller dimension", () => {
    expect(clampCornerRadius(999, 100, 50)).toBe(25);
    expect(clampCornerRadius(8, 100, 50)).toBe(8);
  });

  it("falls back for invalid input", () => {
    expect(clampCornerRadius(Number.NaN, 100, 50)).toBe(16);
    expect(clampCornerRadius(-3, 100, 50)).toBe(16);
  });
});

describe("computeLensDisplacementPixels", () => {
  const w = 96;
  const h = 64;
  const data = computeLensDisplacementPixels(w, h, 16);

  it("returns an RGBA buffer of the right size", () => {
    expect(data.length).toBe(w * h * 4);
  });

  it("is neutral at the center (no displacement)", () => {
    const [r, g, b, a] = px(data, w, w / 2, h / 2);
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
    expect(a).toBe(255);
  });

  it("is neutral outside the rounded corner", () => {
    const [r, g] = px(data, w, 0, 0);
    expect(r).toBe(128);
    expect(g).toBe(128);
  });

  it("displaces toward the center at the edges", () => {
    const [leftR] = px(data, w, 1, h / 2);
    expect(leftR).toBeGreaterThan(128);
    const [rightR] = px(data, w, w - 2, h / 2);
    expect(rightR).toBeLessThan(128);
    const [, topG] = px(data, w, w / 2, 1);
    expect(topG).toBeGreaterThan(128);
    const [, bottomG] = px(data, w, w / 2, h - 2);
    expect(bottomG).toBeLessThan(128);
  });

  it("is horizontally symmetric", () => {
    const y = h / 2;
    const [lr] = px(data, w, 4, y);
    const [rr] = px(data, w, w - 4, y);
    expect(Math.abs(lr - 128 + (rr - 128))).toBeLessThanOrEqual(1);
  });

  it("displacement grows toward the edge within the bezel", () => {
    const y = h / 2;
    const [nearEdge] = px(data, w, 2, y);
    const [midBezel] = px(data, w, 14, y);
    expect(nearEdge).toBeGreaterThan(midBezel);
  });
});
