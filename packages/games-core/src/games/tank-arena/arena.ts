import { ceilDiv, Terrain } from "@kyzen/physics";
import {
  MINE_LIFT,
  MODULE_WIDTH,
  TERRAIN_CELL_WIDTH,
  WATER_Y,
} from "./constants";

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type Anchor = { x: number; y: number; airborne: boolean };

export type SpawnSlot = { x: number; module: number; sheltered: boolean };

export type Arena = {
  modules: number;
  width: number;
  waterY: number;
  boxes: Box[];
  spawnSlots: SpawnSlot[];
  pickupAnchors: Anchor[];
  mineAnchors: Anchor[];
};

const MODULE_BOXES: readonly Box[] = [
  { x0: 0, y0: -3, x1: 13, y1: 0 },
  { x0: 17, y0: -3, x1: 32, y1: 0 },
  { x0: 2, y0: 7, x1: 10.5, y1: 8 },
  { x0: 2, y0: 0, x1: 3, y1: 7 },
  { x0: 11.5, y0: 13.5, x1: 18.5, y1: 15 },
  { x0: 21, y0: 7.5, x1: 29.5, y1: 8.5 },
  { x0: 30, y0: 0, x1: 31, y1: 2.2 },
];

const MODULE_SPAWNS = [
  { x: 7, sheltered: true },
  { x: 25, sheltered: false },
] as const;

const MODULE_PICKUPS: readonly Anchor[] = [
  { x: 6.5, y: 9.6, airborne: false },
  { x: 15, y: 17.5, airborne: true },
  { x: 15, y: 4.5, airborne: true },
  { x: 25.2, y: 10, airborne: true },
  { x: 19.5, y: 1, airborne: false },
];

const MODULE_MINES: readonly Anchor[] = [
  { x: 5, y: MINE_LIFT, airborne: false },
  { x: 11, y: MINE_LIFT, airborne: false },
  { x: 19.5, y: MINE_LIFT, airborne: false },
  { x: 23, y: 8.5 + MINE_LIFT, airborne: false },
  { x: 27, y: 8.5 + MINE_LIFT, airborne: false },
];

export function modulesFor(players: number): number {
  return Math.max(2, ceilDiv(players, 2));
}

function repeat<T extends { x: number }>(
  items: readonly T[],
  modules: number,
): T[] {
  const out: T[] = [];
  for (let m = 0; m < modules; m++)
    for (const item of items)
      out.push({ ...item, x: item.x + m * MODULE_WIDTH });
  return out;
}

export function buildArena(modules: number): Arena {
  const boxes: Box[] = [];
  for (let m = 0; m < modules; m++) {
    const shift = m * MODULE_WIDTH;
    for (const box of MODULE_BOXES)
      boxes.push({ ...box, x0: box.x0 + shift, x1: box.x1 + shift });
  }
  const spawnSlots: SpawnSlot[] = [];
  for (let m = 0; m < modules; m++)
    for (const spawn of MODULE_SPAWNS)
      spawnSlots.push({
        x: spawn.x + m * MODULE_WIDTH,
        module: m,
        sheltered: spawn.sheltered,
      });
  return {
    modules,
    width: modules * MODULE_WIDTH,
    waterY: WATER_Y,
    boxes,
    spawnSlots,
    pickupAnchors: repeat(MODULE_PICKUPS, modules),
    mineAnchors: repeat(MODULE_MINES, modules),
  };
}

const terrains = new Map<number, Terrain>();

export function terrainFor(modules: number): Terrain {
  let terrain = terrains.get(modules);
  if (!terrain) {
    terrain = new Terrain({
      boxes: buildArena(modules).boxes.map((box) => ({
        minX: box.x0,
        minY: box.y0,
        maxX: box.x1,
        maxY: box.y1,
      })),
      width: modules * MODULE_WIDTH,
      wrap: true,
      cellWidth: TERRAIN_CELL_WIDTH,
    });
    terrains.set(modules, terrain);
  }
  return terrain;
}
