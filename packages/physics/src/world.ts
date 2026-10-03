import {
  boxesOverlap,
  boxTouchesCircle,
  sweepPointBox,
  sweepPointCircle,
  sweepPointSegment,
  wrapDelta,
  wrapX,
} from "./geometry";
import { CONTACT_EPSILON, type Terrain } from "./terrain";
import type {
  Body,
  BodyDef,
  BoxShape,
  Filter,
  PhysicsEvent,
  RayHit,
  Shape,
} from "./types";

const ALL_BITS = 0xffffffff;
const DEFAULT_REST_SPEED = 0.05;
const DEFAULT_REST_STEPS = 20;
const POINT: Shape = { type: "point" };
const NO_BODIES: readonly never[] = [];

export type WorldConfig = {
  terrain: Terrain;
  gravity: number;
  dt: number;
  killY?: number;
  restSpeed?: number;
  restSteps?: number;
};

function accepts<T>(
  layer: number,
  mask: number,
  group: number,
  other: Body<T>,
): boolean {
  return (
    (layer & other.mask) !== 0 &&
    (other.layer & mask) !== 0 &&
    (group === 0 || group !== other.group)
  );
}

function reachOf(shape: Shape): number {
  if (shape.type === "box") return shape.halfWidth;
  if (shape.type === "circle") return shape.radius;
  if (shape.type === "segment")
    return Math.max(Math.abs(shape.x0), Math.abs(shape.x1));
  return 0;
}

export class World<T> {
  readonly terrain: Terrain;
  readonly gravity: number;
  readonly dt: number;
  readonly killY: number;
  readonly restSpeed: number;
  readonly restSteps: number;
  private readonly all: Body<T>[] = [];
  private readonly dynamics: Body<T>[] = [];
  private readonly bullets: Body<T>[] = [];
  private readonly statics: Body<T>[] = [];
  private readonly grid: Body<T>[][];
  private gridDirty = false;
  private reach = 0;
  private sensors = 0;
  private nextId = 1;
  private hitBody: Body<T> | null = null;
  private hitImageX = 0;
  private normalX = 0;
  private normalY = 0;

  constructor(config: WorldConfig) {
    this.terrain = config.terrain;
    this.gravity = config.gravity;
    this.dt = config.dt;
    this.killY = config.killY ?? Number.NEGATIVE_INFINITY;
    this.restSpeed = config.restSpeed ?? DEFAULT_REST_SPEED;
    this.restSteps = config.restSteps ?? DEFAULT_REST_STEPS;
    this.grid = Array.from({ length: this.terrain.cellCount }, () => []);
  }

  get bodies(): readonly Body<T>[] {
    return this.all;
  }

  get bulletCount(): number {
    return this.bullets.length;
  }

  createBody(def: BodyDef<T>): Body<T> {
    const mass = def.kind === "static" ? 0 : (def.mass ?? 1);
    if (def.kind !== "static" && !(mass > 0))
      throw new Error("Moving bodies need a positive mass");
    const follow = def.kind === "static" ? (def.follow ?? null) : null;
    const body: Body<T> = {
      id: this.nextId++,
      kind: def.kind,
      shape: def.kind === "bullet" ? POINT : def.shape,
      mass,
      invMass: mass > 0 ? 1 / mass : 0,
      sensor: def.kind === "static" && (def.sensor ?? false),
      follow,
      x: this.wrapPosition(follow ? follow.x : def.x),
      y: follow ? follow.y : def.y,
      vx: def.kind === "static" ? 0 : (def.vx ?? 0),
      vy: def.kind === "static" ? 0 : (def.vy ?? 0),
      friction: def.kind === "dynamic" ? (def.friction ?? 0) : 0,
      restitution: def.kind === "dynamic" ? (def.restitution ?? 0) : 0,
      gravityScale: def.kind === "static" ? 0 : (def.gravityScale ?? 1),
      layer: def.layer ?? 1,
      mask: def.mask ?? ALL_BITS,
      group: def.group ?? 0,
      supported: false,
      restSteps: 0,
      sleeping: false,
      removed: false,
      cell: -1,
      data: def.data,
    };
    this.all.push(body);
    if (def.kind === "bullet") {
      this.bullets.push(body);
      return body;
    }
    if (def.kind === "dynamic") {
      this.dynamics.push(body);
      body.supported = this.isSupported(body);
    } else {
      this.statics.push(body);
      if (body.sensor) this.sensors += 1;
    }
    body.cell = this.terrain.cellIndex(body.x);
    this.reach = Math.max(this.reach, reachOf(body.shape));
    this.gridDirty = true;
    return body;
  }

  destroyBody(body: Body<T>): void {
    if (body.removed) return;
    body.removed = true;
    remove(this.all, body);
    if (body.kind === "bullet") {
      remove(this.bullets, body);
      return;
    }
    if (body.kind === "dynamic") remove(this.dynamics, body);
    else {
      remove(this.statics, body);
      if (body.sensor) this.sensors -= 1;
    }
    this.gridDirty = true;
    for (const other of this.statics.filter((item) => item.follow === body))
      this.destroyBody(other);
  }

  step(): PhysicsEvent<T>[] {
    const events: PhysicsEvent<T>[] = [];
    const sunk: Body<T>[] = [];
    for (const body of this.dynamics)
      if (!body.sleeping && this.integrate(body, events)) sunk.push(body);
    for (const body of sunk) this.destroyBody(body);
    this.syncGrid();
    const lost: Body<T>[] = [];
    for (const bullet of this.bullets)
      if (this.moveBullet(bullet, events)) lost.push(bullet);
    for (const body of lost) this.destroyBody(body);
    if (this.sensors > 0)
      for (const body of this.dynamics) this.senseOverlaps(body, events);
    return events;
  }

  applyImpulse(body: Body<T>, ix: number, iy: number): void {
    if (body.invMass === 0) return;
    body.vx += ix * body.invMass;
    body.vy += iy * body.invMass;
    if (iy > 0) body.supported = false;
    this.wake(body);
  }

  launch(body: Body<T>, vx: number, vy: number): void {
    body.vx = vx;
    body.vy = vy;
    body.supported = false;
    this.wake(body);
  }

  settled(): boolean {
    if (this.bullets.length > 0) return false;
    for (const body of this.dynamics) if (!body.sleeping) return false;
    return true;
  }

  raycast(
    x0: number,
    y0: number,
    dx: number,
    dy: number,
    filter: Filter = {},
  ): RayHit<T> | null {
    this.syncGrid();
    const t = this.cast(
      x0,
      y0,
      dx,
      dy,
      filter.layer ?? ALL_BITS,
      filter.mask ?? ALL_BITS,
      filter.group ?? 0,
    );
    if (t < 0) return null;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    this.normalAt(x, y, dx, dy);
    return {
      t,
      x: this.wrapPosition(x),
      y,
      normalX: this.normalX,
      normalY: this.normalY,
      body: this.hitBody,
    };
  }

  lineOfSight(x0: number, y0: number, x1: number, y1: number, inset = 0) {
    return !this.terrain.blocked(x0, y0, x1, y1, inset);
  }

  delta(from: number, to: number): number {
    return this.terrain.wrap
      ? wrapDelta(from, to, this.terrain.width)
      : to - from;
  }

  wrapPosition(x: number): number {
    return this.terrain.wrap ? wrapX(x, this.terrain.width) : x;
  }

  private wake(body: Body<T>): void {
    body.sleeping = false;
    body.restSteps = 0;
  }

  private isSupported(body: Body<T>): boolean {
    const shape = body.shape as BoxShape;
    return this.terrain.supports(
      body.x - shape.halfWidth,
      body.x + shape.halfWidth,
      body.y - shape.halfHeight,
    );
  }

  private integrate(body: Body<T>, events: PhysicsEvent<T>[]): boolean {
    const shape = body.shape as BoxShape;
    const airborne = !body.supported;
    const gravity = this.gravity * body.gravityScale;
    if (body.supported && body.friction > 0) {
      const slow = body.friction * gravity * this.dt;
      if (body.vx > slow) body.vx -= slow;
      else if (body.vx < -slow) body.vx += slow;
      else body.vx = 0;
    }
    body.vy -= gravity * this.dt;
    const dx = body.vx * this.dt;
    if (dx !== 0) this.moveX(body, shape, dx);
    body.supported = false;
    const dy = body.vy * this.dt;
    if (dy !== 0) this.moveY(body, shape, dy);
    this.wrapBody(body, events);
    if (body.y < this.killY) {
      events.push({ type: "fall", body });
      return true;
    }
    if (airborne && body.supported) events.push({ type: "land", body });
    if (
      body.supported &&
      body.vx * body.vx + body.vy * body.vy < this.restSpeed * this.restSpeed
    ) {
      body.restSteps += 1;
      if (body.restSteps >= this.restSteps) body.sleeping = true;
    } else body.restSteps = 0;
    return false;
  }

  private moveX(body: Body<T>, shape: BoxShape, dx: number): void {
    const lead = dx > 0 ? body.x + shape.halfWidth : body.x - shape.halfWidth;
    const target = lead + dx;
    const limit = this.terrain.wallLimit(
      lead,
      target,
      body.y - shape.halfHeight + CONTACT_EPSILON,
      body.y + shape.halfHeight - CONTACT_EPSILON,
    );
    if (limit === target) {
      body.x += dx;
      return;
    }
    body.x = dx > 0 ? limit - shape.halfWidth : limit + shape.halfWidth;
    body.vx = -body.vx * body.restitution;
  }

  private moveY(body: Body<T>, shape: BoxShape, dy: number): void {
    const lead = dy > 0 ? body.y + shape.halfHeight : body.y - shape.halfHeight;
    const target = lead + dy;
    const limit = this.terrain.floorLimit(
      lead,
      target,
      body.x - shape.halfWidth + CONTACT_EPSILON,
      body.x + shape.halfWidth - CONTACT_EPSILON,
    );
    if (limit === target) {
      body.y += dy;
      return;
    }
    if (dy > 0) {
      body.y = limit - shape.halfHeight;
      body.vy = -body.vy * body.restitution;
    } else {
      body.y = limit + shape.halfHeight;
      body.vy = 0;
      body.supported = true;
    }
  }

  private wrapBody(body: Body<T>, events: PhysicsEvent<T>[]): void {
    if (!this.terrain.wrap) return;
    if (body.x >= 0 && body.x < this.terrain.width) return;
    const fromX = body.x;
    body.x = wrapX(body.x, this.terrain.width);
    events.push({ type: "wrap", body, fromX, toX: body.x });
  }

  private moveBullet(body: Body<T>, events: PhysicsEvent<T>[]): boolean {
    body.vy -= this.gravity * body.gravityScale * this.dt;
    const dx = body.vx * this.dt;
    const dy = body.vy * this.dt;
    const t = this.cast(
      body.x,
      body.y,
      dx,
      dy,
      body.layer,
      body.mask,
      body.group,
    );
    if (t >= 0) {
      const x = body.x + dx * t;
      const y = body.y + dy * t;
      this.normalAt(x, y, dx, dy);
      body.x = this.wrapPosition(x);
      body.y = y;
      events.push({
        type: "hit",
        body,
        other: this.hitBody,
        x: body.x,
        y,
        normalX: this.normalX,
        normalY: this.normalY,
      });
      return false;
    }
    body.x += dx;
    body.y += dy;
    this.wrapBody(body, events);
    if (body.y < this.killY) {
      events.push({ type: "fall", body });
      return true;
    }
    return false;
  }

  private syncGrid(): void {
    for (const body of this.dynamics) {
      if (body.sleeping) continue;
      const cell = this.terrain.cellIndex(body.x);
      if (cell === body.cell) continue;
      body.cell = cell;
      this.gridDirty = true;
    }
    for (const body of this.statics) {
      if (!body.follow) continue;
      body.x = body.follow.x;
      body.y = body.follow.y;
      const cell = this.terrain.cellIndex(body.x);
      if (cell === body.cell) continue;
      body.cell = cell;
      this.gridDirty = true;
    }
    if (!this.gridDirty) return;
    for (const cell of this.grid) cell.length = 0;
    for (const body of this.dynamics) this.grid[body.cell]?.push(body);
    for (const body of this.statics) this.grid[body.cell]?.push(body);
    this.gridDirty = false;
  }

  private firstCell(lo: number, hi: number): number {
    const terrain = this.terrain;
    const first = Math.floor(lo / terrain.cellWidth);
    if (!terrain.wrap) return terrain.cellIndex(lo);
    return Math.floor(hi / terrain.cellWidth) - first + 1 >= terrain.cellCount
      ? 0
      : first;
  }

  private lastCell(lo: number, hi: number): number {
    const terrain = this.terrain;
    const last = Math.floor(hi / terrain.cellWidth);
    if (!terrain.wrap) return terrain.cellIndex(hi);
    return last - Math.floor(lo / terrain.cellWidth) + 1 >= terrain.cellCount
      ? terrain.cellCount - 1
      : last;
  }

  private cellAt(k: number): readonly Body<T>[] {
    const n = this.terrain.cellCount;
    return this.grid[k - n * Math.floor(k / n)] ?? NO_BODIES;
  }

  private cast(
    x0: number,
    y0: number,
    dx: number,
    dy: number,
    layer: number,
    mask: number,
    group: number,
  ): number {
    let best = this.terrain.cast(x0, y0, dx, dy);
    this.hitBody = null;
    if (this.all.length === this.bullets.length) return best;
    const lo = Math.min(x0, x0 + dx) - this.reach;
    const hi = Math.max(x0, x0 + dx) + this.reach;
    const last = this.lastCell(lo, hi);
    for (let k = this.firstCell(lo, hi); k <= last; k++) {
      for (const body of this.cellAt(k)) {
        if (!accepts(layer, mask, group, body)) continue;
        const bx = this.terrain.wrap ? x0 + this.delta(x0, body.x) : body.x;
        const t = this.sweepBody(body, bx, x0, y0, dx, dy);
        if (t >= 0 && (best < 0 || t < best)) {
          best = t;
          this.hitBody = body;
          this.hitImageX = bx;
        }
      }
    }
    return best;
  }

  private sweepBody(
    body: Body<T>,
    bx: number,
    x0: number,
    y0: number,
    dx: number,
    dy: number,
  ): number {
    const shape = body.shape;
    if (shape.type === "box")
      return sweepPointBox(
        x0,
        y0,
        dx,
        dy,
        bx - shape.halfWidth,
        body.y - shape.halfHeight,
        bx + shape.halfWidth,
        body.y + shape.halfHeight,
      );
    if (shape.type === "circle")
      return sweepPointCircle(
        x0,
        y0,
        dx,
        dy,
        bx,
        body.y,
        shape.radius,
        body.sensor,
      );
    if (shape.type === "segment")
      return sweepPointSegment(
        x0,
        y0,
        dx,
        dy,
        bx + shape.x0,
        body.y + shape.y0,
        bx + shape.x1,
        body.y + shape.y1,
      );
    return -1;
  }

  private normalAt(x: number, y: number, dx: number, dy: number): void {
    const body = this.hitBody;
    if (!body) {
      const box = this.terrain.hitBox;
      if (box)
        this.faceNormal(
          x,
          y,
          box.minX + this.terrain.hitShift,
          box.minY,
          box.maxX + this.terrain.hitShift,
          box.maxY,
        );
      return;
    }
    const shape = body.shape;
    const bx = this.hitImageX;
    if (shape.type === "box") {
      this.faceNormal(
        x,
        y,
        bx - shape.halfWidth,
        body.y - shape.halfHeight,
        bx + shape.halfWidth,
        body.y + shape.halfHeight,
      );
      return;
    }
    let nx = 0;
    let ny = 0;
    if (shape.type === "circle") {
      nx = x - bx;
      ny = y - body.y;
    } else if (shape.type === "segment") {
      nx = shape.y0 - shape.y1;
      ny = shape.x1 - shape.x0;
      if (nx * dx + ny * dy > 0) {
        nx = -nx;
        ny = -ny;
      }
    }
    const length = Math.sqrt(nx * nx + ny * ny);
    if (length > 0) {
      this.normalX = nx / length + 0;
      this.normalY = ny / length + 0;
      return;
    }
    const speed = Math.sqrt(dx * dx + dy * dy);
    this.normalX = speed > 0 ? -dx / speed + 0 : 0;
    this.normalY = speed > 0 ? -dy / speed + 0 : 0;
  }

  private faceNormal(
    x: number,
    y: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): void {
    const left = Math.abs(x - minX);
    const right = Math.abs(x - maxX);
    const bottom = Math.abs(y - minY);
    const top = Math.abs(y - maxY);
    const nearest = Math.min(left, right, bottom, top);
    this.normalX = nearest === left ? -1 : nearest === right ? 1 : 0;
    this.normalY =
      this.normalX !== 0
        ? 0
        : nearest === bottom
          ? -1
          : nearest === top
            ? 1
            : 0;
  }

  private senseOverlaps(body: Body<T>, events: PhysicsEvent<T>[]): void {
    const shape = body.shape as BoxShape;
    const lo = body.x - shape.halfWidth - this.reach;
    const hi = body.x + shape.halfWidth + this.reach;
    const last = this.lastCell(lo, hi);
    for (let k = this.firstCell(lo, hi); k <= last; k++) {
      for (const other of this.cellAt(k)) {
        if (!other.sensor || !accepts(body.layer, body.mask, body.group, other))
          continue;
        const ox = this.terrain.wrap
          ? body.x + this.delta(body.x, other.x)
          : other.x;
        const touching =
          other.shape.type === "circle"
            ? boxTouchesCircle(
                body.x,
                body.y,
                shape.halfWidth,
                shape.halfHeight,
                ox,
                other.y,
                other.shape.radius,
              )
            : other.shape.type === "box" &&
              boxesOverlap(
                body.x,
                body.y,
                shape.halfWidth,
                shape.halfHeight,
                ox,
                other.y,
                other.shape.halfWidth,
                other.shape.halfHeight,
              );
        if (touching) events.push({ type: "sensor", body, sensor: other });
      }
    }
  }
}

function remove<T>(list: T[], item: T): void {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}
