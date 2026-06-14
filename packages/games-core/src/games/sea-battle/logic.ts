import {
  SEA_BATTLE_BOARD_SIZE,
  SEA_BATTLE_FLEET,
} from "@kyzen/shared/constants";
import type {
  SeaBattleCoord,
  SeaBattleShip,
  SeaBattleShot,
} from "@kyzen/shared/types";

export function coordKey(c: SeaBattleCoord): string {
  return `${c.row},${c.col}`;
}

export function inBounds(c: SeaBattleCoord): boolean {
  return (
    Number.isInteger(c.row) &&
    Number.isInteger(c.col) &&
    c.row >= 0 &&
    c.row < SEA_BATTLE_BOARD_SIZE &&
    c.col >= 0 &&
    c.col < SEA_BATTLE_BOARD_SIZE
  );
}

export function isStraightContiguous(cells: SeaBattleCoord[]): boolean {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;

  const sameRow = cells.every((c) => c.row === cells[0]?.row);
  const sameCol = cells.every((c) => c.col === cells[0]?.col);
  if (!sameRow && !sameCol) return false;

  const axis = sameRow ? cells.map((c) => c.col) : cells.map((c) => c.row);
  const sorted = [...axis].sort((a, b) => a - b);
  const unique = new Set(sorted);
  if (unique.size !== sorted.length) return false;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return false;
  return last - first === sorted.length - 1;
}

export function cellsOf(fleet: SeaBattleShip[]): Set<string> {
  const keys = new Set<string>();
  for (const ship of fleet) {
    for (const cell of ship.cells) {
      keys.add(coordKey(cell));
    }
  }
  return keys;
}

const FLEET_LENGTHS = SEA_BATTLE_FLEET.map((ship) => ship.length);

function sortedLengths(lengths: number[]): number[] {
  return [...lengths].sort((a, b) => a - b);
}

const EXPECTED_LENGTHS = sortedLengths([...FLEET_LENGTHS]);

export function fleetLengthsMatch(ships: SeaBattleShip[]): boolean {
  if (ships.length !== EXPECTED_LENGTHS.length) return false;
  const actual = sortedLengths(ships.map((ship) => ship.cells.length));
  return actual.every((length, i) => length === EXPECTED_LENGTHS[i]);
}

export type FleetValidation = { ok: true } | { ok: false; error: string };

export function validateFleet(ships: SeaBattleShip[]): FleetValidation {
  if (!fleetLengthsMatch(ships)) {
    return { ok: false, error: "Fleet must match the standard composition" };
  }

  const occupied = new Set<string>();
  for (const ship of ships) {
    if (!isStraightContiguous(ship.cells)) {
      return { ok: false, error: "Each ship must be a straight line" };
    }
    for (const cell of ship.cells) {
      if (!inBounds(cell)) {
        return { ok: false, error: "Ships must stay on the board" };
      }
      const key = coordKey(cell);
      if (occupied.has(key)) {
        return { ok: false, error: "Ships may not overlap" };
      }
      occupied.add(key);
    }
  }

  return { ok: true };
}

function shotHits(shots: SeaBattleShot[]): Set<string> {
  const keys = new Set<string>();
  for (const shot of shots) {
    if (shot.hit) keys.add(`${shot.row},${shot.col}`);
  }
  return keys;
}

export function isShipSunk(
  ship: SeaBattleShip,
  shots: SeaBattleShot[],
): boolean {
  const hits = shotHits(shots);
  return ship.cells.every((cell) => hits.has(coordKey(cell)));
}

export function isFleetSunk(
  fleet: SeaBattleShip[],
  shots: SeaBattleShot[],
): boolean {
  if (fleet.length === 0) return false;
  const hits = shotHits(shots);
  return fleet.every((ship) =>
    ship.cells.every((cell) => hits.has(coordKey(cell))),
  );
}

export function sunkShips(
  fleet: SeaBattleShip[],
  shots: SeaBattleShot[],
): SeaBattleShip[] {
  const hits = shotHits(shots);
  return fleet.filter((ship) =>
    ship.cells.every((cell) => hits.has(coordKey(cell))),
  );
}

type Rand = () => number;

function randomInt(rand: Rand, max: number): number {
  return Math.floor(rand() * max);
}

export function generateRandomFleet(rand: Rand = Math.random): SeaBattleShip[] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const occupied = new Set<string>();
    const ships: SeaBattleShip[] = [];
    let ok = true;

    for (const spec of SEA_BATTLE_FLEET) {
      const placed = placeOneShip(spec.length, occupied, rand);
      if (!placed) {
        ok = false;
        break;
      }
      ships.push(placed);
    }

    if (ok && ships.length === SEA_BATTLE_FLEET.length) {
      return ships;
    }
  }

  throw new Error("Failed to generate a random fleet");
}

function placeOneShip(
  length: number,
  occupied: Set<string>,
  rand: Rand,
): SeaBattleShip | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const horizontal = rand() < 0.5;
    const maxRow = horizontal
      ? SEA_BATTLE_BOARD_SIZE
      : SEA_BATTLE_BOARD_SIZE - length + 1;
    const maxCol = horizontal
      ? SEA_BATTLE_BOARD_SIZE - length + 1
      : SEA_BATTLE_BOARD_SIZE;
    const row = randomInt(rand, maxRow);
    const col = randomInt(rand, maxCol);

    const cells: SeaBattleCoord[] = [];
    let collision = false;
    for (let i = 0; i < length; i++) {
      const cell = {
        row: horizontal ? row : row + i,
        col: horizontal ? col + i : col,
      };
      if (occupied.has(coordKey(cell))) {
        collision = true;
        break;
      }
      cells.push(cell);
    }

    if (!collision) {
      for (const cell of cells) occupied.add(coordKey(cell));
      return { cells };
    }
  }
  return null;
}

export function randomUnfiredCell(
  shots: SeaBattleShot[],
  rand: Rand = Math.random,
): SeaBattleCoord {
  const fired = new Set<string>();
  for (const shot of shots) fired.add(`${shot.row},${shot.col}`);

  const available: SeaBattleCoord[] = [];
  for (let row = 0; row < SEA_BATTLE_BOARD_SIZE; row++) {
    for (let col = 0; col < SEA_BATTLE_BOARD_SIZE; col++) {
      if (!fired.has(`${row},${col}`)) available.push({ row, col });
    }
  }

  const pick = available[randomInt(rand, available.length)];
  return pick ?? { row: 0, col: 0 };
}
