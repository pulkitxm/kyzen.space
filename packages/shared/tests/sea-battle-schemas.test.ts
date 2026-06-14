import { describe, expect, test } from "bun:test";
import {
  seaBattleConfigSchema,
  seaBattleMoveSchema,
  seaBattleStateSchema,
} from "../src/types";

function horizontalShip(row: number, col: number, length: number) {
  return {
    cells: Array.from({ length }, (_, i) => ({ row, col: col + i })),
  };
}

const FULL_FLEET = [
  horizontalShip(0, 0, 5),
  horizontalShip(1, 0, 4),
  horizontalShip(2, 0, 3),
  horizontalShip(3, 0, 3),
  horizontalShip(4, 0, 2),
];

describe("sea-battle move schema (discriminated union, strict)", () => {
  test("accepts a place move", () => {
    expect(
      seaBattleMoveSchema.safeParse({ kind: "place", ships: FULL_FLEET })
        .success,
    ).toBe(true);
  });

  test("accepts a fire move", () => {
    expect(
      seaBattleMoveSchema.safeParse({ kind: "fire", row: 3, col: 7 }).success,
    ).toBe(true);
  });

  test("rejects an unknown kind", () => {
    expect(
      seaBattleMoveSchema.safeParse({ kind: "scan", row: 0, col: 0 }).success,
    ).toBe(false);
  });

  test("rejects junk", () => {
    expect(seaBattleMoveSchema.safeParse(undefined).success).toBe(false);
    expect(seaBattleMoveSchema.safeParse("nope").success).toBe(false);
    expect(seaBattleMoveSchema.safeParse({ definitely: "not" }).success).toBe(
      false,
    );
  });

  test("rejects extra keys on a fire move (strict)", () => {
    expect(
      seaBattleMoveSchema.safeParse({ kind: "fire", row: 0, col: 0, cheat: 1 })
        .success,
    ).toBe(false);
  });

  test("rejects out-of-bounds fire coordinates", () => {
    expect(
      seaBattleMoveSchema.safeParse({ kind: "fire", row: 10, col: 0 }).success,
    ).toBe(false);
    expect(
      seaBattleMoveSchema.safeParse({ kind: "fire", row: -1, col: 0 }).success,
    ).toBe(false);
  });

  test("rejects non-integer fire coordinates", () => {
    expect(
      seaBattleMoveSchema.safeParse({ kind: "fire", row: 1.5, col: 0 }).success,
    ).toBe(false);
  });

  test("rejects ship coordinates outside 0..9", () => {
    expect(
      seaBattleMoveSchema.safeParse({
        kind: "place",
        ships: [{ cells: [{ row: 0, col: 10 }] }],
      }).success,
    ).toBe(false);
  });

  test("rejects extra keys on a ship cell (strict coord)", () => {
    expect(
      seaBattleMoveSchema.safeParse({
        kind: "place",
        ships: [{ cells: [{ row: 0, col: 0, z: 1 }] }],
      }).success,
    ).toBe(false);
  });
});

describe("sea-battle state schema (strict, permissive on fleet count)", () => {
  function fullState() {
    return {
      phase: "battle",
      fleets: { A: FULL_FLEET, B: FULL_FLEET },
      shots: {
        A: [{ row: 0, col: 0, hit: true }],
        B: [{ row: 1, col: 1, hit: false }],
      },
      ready: { A: true, B: true },
      currentTurn: "A",
    };
  }

  test("accepts the full authoritative state", () => {
    expect(seaBattleStateSchema.safeParse(fullState()).success).toBe(true);
  });

  test("accepts a redacted view with fewer opponent ships", () => {
    const redacted = {
      ...fullState(),
      fleets: { A: FULL_FLEET, B: [] },
    };
    expect(seaBattleStateSchema.safeParse(redacted).success).toBe(true);
  });

  test("accepts the empty placement state", () => {
    expect(
      seaBattleStateSchema.safeParse({
        phase: "placement",
        fleets: { A: [], B: [] },
        shots: { A: [], B: [] },
        ready: { A: false, B: false },
        currentTurn: "A",
      }).success,
    ).toBe(true);
  });

  test("rejects an invalid phase", () => {
    expect(
      seaBattleStateSchema.safeParse({ ...fullState(), phase: "endgame" })
        .success,
    ).toBe(false);
  });

  test("rejects extra top-level keys (strict)", () => {
    expect(
      seaBattleStateSchema.safeParse({ ...fullState(), salvo: true }).success,
    ).toBe(false);
  });

  test("rejects extra keys inside fleets (strict)", () => {
    expect(
      seaBattleStateSchema.safeParse({
        ...fullState(),
        fleets: { A: FULL_FLEET, B: FULL_FLEET, C: [] },
      }).success,
    ).toBe(false);
  });
});

describe("sea-battle config schema", () => {
  test("accepts an empty object", () => {
    expect(seaBattleConfigSchema.safeParse({}).success).toBe(true);
  });

  test("rejects any extra key (strict)", () => {
    expect(seaBattleConfigSchema.safeParse({ size: 10 }).success).toBe(false);
  });
});
