import { describe, expect, test } from "bun:test";
import type {
  SeaBattleCoord,
  SeaBattleShip,
  SeaBattleShot,
} from "@kyzen/shared/types";
import {
  cellsOf,
  coordKey,
  fleetLengthsMatch,
  generateRandomFleet,
  inBounds,
  isFleetSunk,
  isShipSunk,
  isStraightContiguous,
  randomUnfiredCell,
  sunkShips,
  validateFleet,
} from "../src/index";

function horizontalShip(
  row: number,
  col: number,
  length: number,
): SeaBattleShip {
  return { cells: Array.from({ length }, (_, i) => ({ row, col: col + i })) };
}

function verticalShip(row: number, col: number, length: number): SeaBattleShip {
  return { cells: Array.from({ length }, (_, i) => ({ row: row + i, col })) };
}

function legalFleet(): SeaBattleShip[] {
  return [
    horizontalShip(0, 0, 5),
    horizontalShip(1, 0, 4),
    horizontalShip(2, 0, 3),
    horizontalShip(3, 0, 3),
    horizontalShip(4, 0, 2),
  ];
}

function hitsFor(cells: SeaBattleCoord[]): SeaBattleShot[] {
  return cells.map((c) => ({ row: c.row, col: c.col, hit: true }));
}

describe("coordKey", () => {
  test("encodes row,col and distinguishes transposed cells", () => {
    expect(coordKey({ row: 3, col: 7 })).toBe("3,7");
    expect(coordKey({ row: 7, col: 3 })).not.toBe(coordKey({ row: 3, col: 7 }));
  });
});

describe("inBounds", () => {
  test("accepts the corners and rejects each off-board direction", () => {
    expect(inBounds({ row: 0, col: 0 })).toBe(true);
    expect(inBounds({ row: 9, col: 9 })).toBe(true);
    expect(inBounds({ row: -1, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: -1 })).toBe(false);
    expect(inBounds({ row: 10, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: 10 })).toBe(false);
  });

  test("rejects non-integer and NaN coordinates", () => {
    expect(inBounds({ row: 1.5, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: 9.5 })).toBe(false);
    expect(inBounds({ row: Number.NaN, col: 0 })).toBe(false);
  });
});

describe("isStraightContiguous", () => {
  test("rejects an empty cell list", () => {
    expect(isStraightContiguous([])).toBe(false);
  });

  test("accepts a single cell", () => {
    expect(isStraightContiguous([{ row: 4, col: 4 }])).toBe(true);
  });

  test("accepts a contiguous horizontal and vertical run", () => {
    expect(isStraightContiguous(horizontalShip(2, 1, 4).cells)).toBe(true);
    expect(isStraightContiguous(verticalShip(2, 1, 4).cells)).toBe(true);
  });

  test("accepts cells given out of order", () => {
    expect(
      isStraightContiguous([
        { row: 0, col: 3 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ]),
    ).toBe(true);
  });

  test("rejects a diagonal run", () => {
    expect(
      isStraightContiguous([
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ]),
    ).toBe(false);
  });

  test("rejects a gapped (non-contiguous) straight run", () => {
    expect(
      isStraightContiguous([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 3 },
      ]),
    ).toBe(false);
  });

  test("rejects a run with a duplicate cell", () => {
    expect(
      isStraightContiguous([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 1 },
      ]),
    ).toBe(false);
  });
});

describe("cellsOf", () => {
  test("flattens every ship cell into a unique key set", () => {
    const keys = cellsOf([horizontalShip(0, 0, 2), verticalShip(5, 5, 2)]);
    expect(keys).toEqual(new Set(["0,0", "0,1", "5,5", "6,5"]));
  });

  test("collapses overlapping cells into one key", () => {
    const keys = cellsOf([horizontalShip(0, 0, 2), horizontalShip(0, 1, 2)]);
    expect(keys.size).toBe(3);
  });
});

describe("fleetLengthsMatch", () => {
  test("accepts the standard composition regardless of ship order", () => {
    const shuffled = [
      horizontalShip(0, 0, 2),
      horizontalShip(1, 0, 5),
      horizontalShip(2, 0, 3),
      horizontalShip(3, 0, 4),
      horizontalShip(4, 0, 3),
    ];
    expect(fleetLengthsMatch(shuffled)).toBe(true);
  });

  test("rejects the right count but a wrong length multiset", () => {
    const wrong = [
      horizontalShip(0, 0, 5),
      horizontalShip(1, 0, 4),
      horizontalShip(2, 0, 3),
      horizontalShip(3, 0, 2),
      horizontalShip(4, 0, 2),
    ];
    expect(wrong).toHaveLength(5);
    expect(fleetLengthsMatch(wrong)).toBe(false);
  });

  test("rejects too few and too many ships", () => {
    expect(fleetLengthsMatch(legalFleet().slice(0, 4))).toBe(false);
    expect(fleetLengthsMatch([...legalFleet(), horizontalShip(8, 0, 2)])).toBe(
      false,
    );
  });
});

describe("validateFleet error strings", () => {
  test("accepts the standard fleet", () => {
    expect(validateFleet(legalFleet())).toEqual({ ok: true });
  });

  test("reports a composition mismatch first", () => {
    const res = validateFleet([horizontalShip(0, 0, 5)]);
    expect(res).toEqual({
      ok: false,
      error: "Fleet must match the standard composition",
    });
  });

  test("reports a non-straight ship distinctly", () => {
    const fleet = legalFleet();
    fleet[0] = {
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 0, col: 3 },
        { row: 0, col: 4 },
      ],
    };
    expect(validateFleet(fleet)).toEqual({
      ok: false,
      error: "Each ship must be a straight line",
    });
  });

  test("reports an off-board ship distinctly", () => {
    const fleet = legalFleet();
    fleet[0] = horizontalShip(0, 6, 5);
    expect(validateFleet(fleet)).toEqual({
      ok: false,
      error: "Ships must stay on the board",
    });
  });

  test("reports overlapping ships distinctly", () => {
    const fleet = legalFleet();
    fleet[1] = horizontalShip(0, 0, 4);
    expect(validateFleet(fleet)).toEqual({
      ok: false,
      error: "Ships may not overlap",
    });
  });
});

describe("isShipSunk", () => {
  test("a ship one hit short is not sunk", () => {
    const ship = horizontalShip(0, 0, 3);
    const shots = hitsFor(ship.cells.slice(0, 2));
    expect(isShipSunk(ship, shots)).toBe(false);
  });

  test("a fully-hit ship is sunk", () => {
    const ship = horizontalShip(0, 0, 3);
    expect(isShipSunk(ship, hitsFor(ship.cells))).toBe(true);
  });

  test("a miss on every cell does not sink the ship", () => {
    const ship = horizontalShip(0, 0, 2);
    const misses = ship.cells.map((c) => ({
      row: c.row,
      col: c.col,
      hit: false,
    }));
    expect(isShipSunk(ship, misses)).toBe(false);
  });
});

describe("isFleetSunk", () => {
  test("an empty fleet is never sunk", () => {
    expect(isFleetSunk([], [])).toBe(false);
  });

  test("one cell short of the whole fleet is not sunk", () => {
    const fleet = legalFleet();
    const all = fleet.flatMap((s) => s.cells);
    expect(isFleetSunk(fleet, hitsFor(all.slice(0, all.length - 1)))).toBe(
      false,
    );
  });

  test("every cell hit sinks the whole fleet", () => {
    const fleet = legalFleet();
    const all = fleet.flatMap((s) => s.cells);
    expect(isFleetSunk(fleet, hitsFor(all))).toBe(true);
  });
});

describe("sunkShips", () => {
  test("returns only the ships whose every cell is hit", () => {
    const fleet = legalFleet();
    const carrier = fleet[0];
    const destroyer = fleet[4];
    if (!carrier || !destroyer) throw new Error("malformed fleet");
    const shots = [...hitsFor(carrier.cells), ...hitsFor(destroyer.cells)];
    const result = sunkShips(fleet, shots);
    expect(result).toHaveLength(2);
    expect(result).toContain(carrier);
    expect(result).toContain(destroyer);
  });

  test("returns an empty array when nothing is fully hit", () => {
    const fleet = legalFleet();
    const carrier = fleet[0];
    if (!carrier) throw new Error("malformed fleet");
    const partial = hitsFor(carrier.cells.slice(0, 1));
    expect(sunkShips(fleet, partial)).toEqual([]);
  });
});

describe("randomUnfiredCell", () => {
  test("returns the only remaining cell when 99 are fired", () => {
    const shots: SeaBattleShot[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if (row === 4 && col === 7) continue;
        shots.push({ row, col, hit: false });
      }
    }
    expect(shots).toHaveLength(99);
    const cell = randomUnfiredCell(shots);
    expect(cell).toEqual({ row: 4, col: 7 });
  });

  test("never returns an already-fired cell on a sparse board", () => {
    const shots: SeaBattleShot[] = [
      { row: 0, col: 0, hit: false },
      { row: 3, col: 3, hit: true },
    ];
    for (let i = 0; i < 200; i++) {
      const cell = randomUnfiredCell(shots, () => i / 200);
      expect(inBounds(cell)).toBe(true);
      const collides = shots.some(
        (s) => s.row === cell.row && s.col === cell.col,
      );
      expect(collides).toBe(false);
    }
  });
});

describe("generateRandomFleet", () => {
  test("every generated fleet passes validateFleet", () => {
    for (let i = 0; i < 50; i++) {
      const fleet = generateRandomFleet();
      expect(validateFleet(fleet)).toEqual({ ok: true });
    }
  });
});
