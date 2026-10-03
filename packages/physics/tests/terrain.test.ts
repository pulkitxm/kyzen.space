import { describe, expect, test } from "bun:test";
import { Terrain } from "../src/terrain";

const floor = { minX: 0, minY: -2, maxX: 30, maxY: 0 };
const pillar = { minX: 36, minY: 0, maxX: 38, maxY: 6 };

describe("Terrain", () => {
  test("tiles the width into whole cells", () => {
    const terrain = new Terrain({ boxes: [], width: 64, cellWidth: 10 });
    expect(terrain.cellCount).toBe(6);
    expect(terrain.cellWidth).toBeCloseTo(64 / 6, 12);
    expect(() => new Terrain({ boxes: [], width: 0 })).toThrow();
  });

  test("casts see every periodic image of a wrapped map", () => {
    const terrain = new Terrain({ boxes: [pillar], width: 64, wrap: true });
    expect(terrain.cast(30, 3, 10, 0)).toBeCloseTo(0.6, 12);
    expect(terrain.cast(-30, 3, 10, 0)).toBeCloseTo(0.2, 12);
    expect(terrain.cast(94, 3, 10, 0)).toBeCloseTo(0.6, 12);
    expect(terrain.cast(30, 7, 10, 0)).toBe(-1);
    expect(terrain.hitBox).toBeNull();
  });

  test("a box straddling the seam is found from both sides", () => {
    const seam = { minX: 62, minY: 0, maxX: 66, maxY: 2 };
    const terrain = new Terrain({ boxes: [seam], width: 64, wrap: true });
    expect(terrain.cast(10, 1, -10, 0)).toBeCloseTo(0.8, 12);
    expect(terrain.cast(50, 1, 10, 0)).toBe(-1);
    expect(terrain.cast(50, 1, 20, 0)).toBeCloseTo(0.6, 12);
  });

  test("limits stop movement at the nearest face", () => {
    const terrain = new Terrain({ boxes: [floor, pillar], width: 64 });
    expect(terrain.wallLimit(34, 40, 0.5, 2)).toBe(36);
    expect(terrain.wallLimit(34, 35, 0.5, 2)).toBe(35);
    expect(terrain.wallLimit(34, 40, 6.5, 8)).toBe(40);
    expect(terrain.floorLimit(1, -1, 2, 4)).toBe(0);
    expect(terrain.floorLimit(1, -1, 31, 33)).toBe(-1);
  });

  test("support needs real overlap with a top face", () => {
    const terrain = new Terrain({ boxes: [floor], width: 64 });
    expect(terrain.supports(29.99, 31.99, 0)).toBe(true);
    expect(terrain.supports(30, 32, 0)).toBe(false);
    expect(terrain.supports(10, 12, 0.01)).toBe(false);
  });

  test("line of sight ignores grazing contact inside the inset", () => {
    const terrain = new Terrain({ boxes: [pillar], width: 64 });
    expect(terrain.blocked(30, 3, 44, 3, 0)).toBe(true);
    expect(terrain.blocked(30, 6, 44, 6, 0)).toBe(true);
    expect(terrain.blocked(30, 6, 44, 6, 0.01)).toBe(false);
  });

  test("a map without wrap clamps queries to the edge cells", () => {
    const terrain = new Terrain({
      boxes: [{ minX: 60, minY: 0, maxX: 80, maxY: 2 }],
      width: 64,
    });
    expect(terrain.cast(70, 5, 0, -10)).toBeCloseTo(0.3, 12);
    expect(terrain.cast(-10, 1, -10, 0)).toBe(-1);
  });
});
