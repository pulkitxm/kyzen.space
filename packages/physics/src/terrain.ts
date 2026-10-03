import { sweepPointBox } from "./geometry";
import type { Aabb } from "./types";

export const CONTACT_EPSILON = 1e-6;
const SUPPORT_TOLERANCE = 1e-3;
const DEFAULT_CELL_WIDTH = 8;
const NO_BOXES: readonly Aabb[] = [];

export type TerrainOptions = {
  boxes: readonly Aabb[];
  width: number;
  wrap?: boolean;
  cellWidth?: number;
};

export class Terrain {
  readonly boxes: readonly Aabb[];
  readonly width: number;
  readonly wrap: boolean;
  readonly cellCount: number;
  readonly cellWidth: number;
  hitBox: Aabb | null = null;
  hitShift = 0;
  private readonly cells: Aabb[][];

  constructor(options: TerrainOptions) {
    if (!(options.width > 0)) throw new Error("Terrain width must be positive");
    this.width = options.width;
    this.wrap = options.wrap ?? false;
    this.cellCount = Math.max(
      1,
      Math.round(options.width / (options.cellWidth ?? DEFAULT_CELL_WIDTH)),
    );
    this.cellWidth = options.width / this.cellCount;
    this.boxes = options.boxes.map((box) => ({ ...box }));
    this.cells = Array.from({ length: this.cellCount }, () => []);
    for (const box of this.boxes) {
      const first = Math.floor(box.minX / this.cellWidth);
      const last = Math.floor(box.maxX / this.cellWidth);
      for (let k = first; k <= last; k++) {
        if (this.wrap) {
          const turns = Math.floor(k / this.cellCount);
          const shift = turns * this.width;
          this.cells[k - turns * this.cellCount]?.push(
            turns === 0
              ? box
              : {
                  minX: box.minX - shift,
                  minY: box.minY,
                  maxX: box.maxX - shift,
                  maxY: box.maxY,
                },
          );
        } else {
          const cell = this.cells[this.clampCell(k)];
          if (cell && cell[cell.length - 1] !== box) cell.push(box);
        }
      }
    }
  }

  cellIndex(x: number): number {
    const k = Math.floor(x / this.cellWidth);
    if (!this.wrap) return this.clampCell(k);
    const index = k - this.cellCount * Math.floor(k / this.cellCount);
    return index;
  }

  cast(x0: number, y0: number, dx: number, dy: number): number {
    let best = -1;
    this.hitBox = null;
    const first = this.spanCell(Math.min(x0, x0 + dx));
    const last = this.spanCell(Math.max(x0, x0 + dx));
    for (let k = first; k <= last; k++) {
      const shift = this.shiftOf(k);
      for (const box of this.cellAt(k)) {
        const t = sweepPointBox(
          x0,
          y0,
          dx,
          dy,
          box.minX + shift,
          box.minY,
          box.maxX + shift,
          box.maxY,
        );
        if (t >= 0 && (best < 0 || t < best)) {
          best = t;
          this.hitBox = box;
          this.hitShift = shift;
        }
      }
    }
    return best;
  }

  blocked(x0: number, y0: number, x1: number, y1: number, inset: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const first = this.spanCell(Math.min(x0, x1));
    const last = this.spanCell(Math.max(x0, x1));
    for (let k = first; k <= last; k++) {
      const shift = this.shiftOf(k);
      for (const box of this.cellAt(k)) {
        if (
          sweepPointBox(
            x0,
            y0,
            dx,
            dy,
            box.minX + shift + inset,
            box.minY + inset,
            box.maxX + shift - inset,
            box.maxY - inset,
          ) >= 0
        )
          return true;
      }
    }
    return false;
  }

  wallLimit(lead: number, target: number, bottom: number, top: number) {
    let limit = target;
    const forward = target > lead;
    const first = this.spanCell(Math.min(lead, target) - CONTACT_EPSILON);
    const last = this.spanCell(Math.max(lead, target) + CONTACT_EPSILON);
    for (let k = first; k <= last; k++) {
      const shift = this.shiftOf(k);
      for (const box of this.cellAt(k)) {
        if (box.maxY <= bottom || box.minY >= top) continue;
        if (forward) {
          const face = box.minX + shift;
          if (face >= lead - CONTACT_EPSILON && face < limit) limit = face;
        } else {
          const face = box.maxX + shift;
          if (face <= lead + CONTACT_EPSILON && face > limit) limit = face;
        }
      }
    }
    return limit;
  }

  floorLimit(lead: number, target: number, left: number, right: number) {
    let limit = target;
    const upward = target > lead;
    const first = this.spanCell(left);
    const last = this.spanCell(right);
    for (let k = first; k <= last; k++) {
      const shift = this.shiftOf(k);
      for (const box of this.cellAt(k)) {
        if (box.maxX + shift <= left || box.minX + shift >= right) continue;
        if (upward) {
          if (box.minY >= lead - CONTACT_EPSILON && box.minY < limit)
            limit = box.minY;
        } else if (box.maxY <= lead + CONTACT_EPSILON && box.maxY > limit)
          limit = box.maxY;
      }
    }
    return limit;
  }

  supports(left: number, right: number, bottom: number): boolean {
    const first = this.spanCell(left);
    const last = this.spanCell(right);
    for (let k = first; k <= last; k++) {
      const shift = this.shiftOf(k);
      for (const box of this.cellAt(k)) {
        if (
          box.maxX + shift > left + CONTACT_EPSILON &&
          box.minX + shift < right - CONTACT_EPSILON &&
          Math.abs(bottom - box.maxY) <= SUPPORT_TOLERANCE
        )
          return true;
      }
    }
    return false;
  }

  private clampCell(k: number): number {
    return k < 0 ? 0 : k >= this.cellCount ? this.cellCount - 1 : k;
  }

  private spanCell(x: number): number {
    const k = Math.floor(x / this.cellWidth);
    return this.wrap ? k : this.clampCell(k);
  }

  private shiftOf(k: number): number {
    return this.wrap ? Math.floor(k / this.cellCount) * this.width : 0;
  }

  private cellAt(k: number): readonly Aabb[] {
    const index = this.wrap
      ? k - this.cellCount * Math.floor(k / this.cellCount)
      : k;
    return this.cells[index] ?? NO_BOXES;
  }
}
