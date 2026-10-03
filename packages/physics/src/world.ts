import { createBody, shapeHalfHeight, shapeHalfWidth } from "./body";
import {
  bodyAABB,
  boxTouchesCircle,
  circlesTouching,
  sweepBoxVsBox,
  sweepCircleVsBox,
  sweepCircleVsCircle,
  sweepPointVsBox,
  sweepPointVsSegment,
  wrapDelta,
  wrapX,
} from "./geometry";
import type {
  AABB,
  Body,
  BodyDef,
  BoxShape,
  CircleShape,
  PhysicsEvent,
  RaycastResult,
  SegmentShape,
  SweepResult,
  WorldConfig,
} from "./types";

const DEFAULT_GRAVITY = 30;
const DEFAULT_DT = 1 / 60;
const DEFAULT_FRICTION = 14;
const DEFAULT_RESTITUTION = 0.15;
const DEFAULT_REST_SPEED = 0.05;
const DEFAULT_REST_FRAMES = 20;
const DEFAULT_BUCKET_SIZE = 8;

export interface StaticBox {
  x: number;
  y: number;
  hw: number;
  hh: number;
  module?: number;
}

export class World {
  readonly gravity: number;
  readonly dt: number;
  readonly width: number;
  readonly wrapX: boolean;
  readonly friction: number;
  readonly restitution: number;
  readonly restSpeed: number;
  readonly restFrames: number;
  readonly waterY: number | null;
  readonly bucketSize: number;

  private bodies: Map<string, Body> = new Map();
  private staticBoxes: StaticBox[] = [];
  private staticModuleBoxes: StaticBox[][] = [];
  private moduleWidth: number = 32;
  private moduleCount: number = 0;
  private events: PhysicsEvent[] = [];

  constructor(config: WorldConfig) {
    this.gravity = config.gravity ?? DEFAULT_GRAVITY;
    this.dt = config.dt ?? DEFAULT_DT;
    this.width = config.width ?? 0;
    this.wrapX = config.wrapX ?? false;
    this.friction = config.friction ?? DEFAULT_FRICTION;
    this.restitution = config.restitution ?? DEFAULT_RESTITUTION;
    this.restSpeed = config.restSpeed ?? DEFAULT_REST_SPEED;
    this.restFrames = config.restFrames ?? DEFAULT_REST_FRAMES;
    this.waterY = config.waterY ?? null;
    this.bucketSize = config.bucketSize ?? DEFAULT_BUCKET_SIZE;
  }

  addBody(def: BodyDef): Body {
    const body = createBody(def);
    this.bodies.set(body.id, body);
    return body;
  }

  removeBody(id: string): void {
    this.bodies.delete(id);
  }

  getBody(id: string): Body | undefined {
    return this.bodies.get(id);
  }

  getAllBodies(): Body[] {
    return Array.from(this.bodies.values());
  }

  clearBodies(): void {
    this.bodies.clear();
  }

  setStaticBoxes(boxes: StaticBox[], moduleWidth: number = 32): void {
    this.staticBoxes = boxes;
    this.moduleWidth = moduleWidth;
    this.moduleCount = this.width > 0 ? Math.ceil(this.width / moduleWidth) : 0;

    this.staticModuleBoxes = [];
    for (let m = 0; m < this.moduleCount; m++) {
      this.staticModuleBoxes.push([]);
    }

    for (const box of boxes) {
      if (box.module !== undefined && box.module < this.moduleCount) {
        this.staticModuleBoxes[box.module]?.push(box);
      } else {
        const m = Math.floor(box.x / moduleWidth);
        if (m >= 0 && m < this.moduleCount) {
          this.staticModuleBoxes[m]?.push(box);
        }
      }
    }
  }

  step(): PhysicsEvent[] {
    this.events = [];

    for (const body of this.bodies.values()) {
      if (body.type !== "dynamic" || body.sleeping) continue;
      this.integrateBody(body);
    }

    return this.events;
  }

  private integrateBody(body: Body): void {
    const wasAirborne = !body.supported;

    if (body.supported) {
      const slow = this.friction * this.dt;
      if (body.vx > slow) body.vx -= slow;
      else if (body.vx < -slow) body.vx += slow;
      else body.vx = 0;
    }

    body.vy -= this.gravity * body.gravityScale * this.dt;

    if (body.linearDamping > 0) {
      const factor = 1 - body.linearDamping * this.dt;
      body.vx *= factor;
      body.vy *= factor;
    }

    const dx = body.vx * this.dt;
    if (dx !== 0) this.moveBodyX(body, dx);

    body.supported = false;
    const dy = body.vy * this.dt;
    if (dy !== 0) this.moveBodyY(body, dy);

    if (this.wrapX && this.width > 0) {
      const oldX = body.x;
      body.x = wrapX(body.x, this.width);
      if (Math.abs(body.x - oldX) > this.width / 2) {
        this.events.push({
          type: "wrap",
          bodyA: body,
          data: { fromX: oldX, toX: body.x },
        });
      }
    }

    if (this.waterY !== null && body.y < this.waterY) {
      this.events.push({
        type: "contactBegin",
        bodyA: body,
        data: { cause: "water" },
      });
    }

    if (wasAirborne && body.supported) {
      this.events.push({ type: "land", bodyA: body });
    }

    this.updateRest(body);
  }

  private moveBodyX(body: Body, dx: number): void {
    const shape = body.shape;
    if (shape.type === "segment") {
      body.x += dx;
      return;
    }

    const hw = shapeHalfWidth(shape);
    const hh = shapeHalfHeight(shape);
    const bottom = body.y - hh + 1e-6;
    const top = body.y + hh - 1e-6;
    const lead = dx > 0 ? body.x + hw : body.x - hw;
    const target = lead + dx;
    let limit = target;

    for (const box of this.getRelevantBoxes(
      Math.min(lead, target),
      Math.max(lead, target),
    )) {
      if (box.y + box.hh <= bottom || box.y - box.hh >= top) continue;
      if (dx > 0) {
        const face = box.x - box.hw;
        if (face >= lead - 1e-6 && face < limit) limit = face;
      } else {
        const face = box.x + box.hw;
        if (face <= lead + 1e-6 && face > limit) limit = face;
      }
    }

    if (limit === target) {
      body.x += dx;
      return;
    }

    body.x = dx > 0 ? limit - hw : limit + hw;
    body.vx = -body.vx * this.restitution;
  }

  private moveBodyY(body: Body, dy: number): void {
    const shape = body.shape;
    if (shape.type === "segment") {
      body.y += dy;
      return;
    }

    const hw = shapeHalfWidth(shape);
    const hh = shapeHalfHeight(shape);
    const left = body.x - hw + 1e-6;
    const right = body.x + hw - 1e-6;
    const lead = dy > 0 ? body.y + hh : body.y - hh;
    const target = lead + dy;
    let limit = target;

    for (const box of this.getRelevantBoxes(left, right)) {
      if (box.x + box.hw <= left || box.x - box.hw >= right) continue;
      if (dy > 0) {
        if (box.y - box.hh >= lead - 1e-6 && box.y - box.hh < limit)
          limit = box.y - box.hh;
      } else if (box.y + box.hh <= lead + 1e-6 && box.y + box.hh > limit)
        limit = box.y + box.hh;
    }

    if (limit === target) {
      body.y += dy;
      return;
    }

    if (dy > 0) {
      body.y = limit - hh;
      body.vy = -body.vy * this.restitution;
    } else {
      body.y = limit + hh;
      body.vy = 0;
      body.supported = true;
    }
  }

  private getRelevantBoxes(xMin: number, xMax: number): StaticBox[] {
    if (this.moduleCount === 0) return this.staticBoxes;

    const boxes: StaticBox[] = [];
    const first = Math.floor(xMin / this.moduleWidth);
    const last = Math.floor(xMax / this.moduleWidth);

    for (let k = first; k <= last; k++) {
      let m = k % this.moduleCount;
      if (m < 0) m += this.moduleCount;
      const moduleBoxes = this.staticModuleBoxes[m];
      if (!moduleBoxes) continue;

      const shift = k * this.moduleWidth;
      for (const box of moduleBoxes) {
        boxes.push({
          x: box.x + shift - (box.module ?? 0) * this.moduleWidth,
          y: box.y,
          hw: box.hw,
          hh: box.hh,
        });
      }
    }

    return boxes;
  }

  private updateRest(body: Body): void {
    const speedSq = body.vx * body.vx + body.vy * body.vy;
    const limitSq = this.restSpeed * this.restSpeed;

    if (body.supported && speedSq < limitSq) {
      body.restFrames += 1;
      if (body.restFrames >= this.restFrames && !body.sleeping) {
        body.sleeping = true;
        this.events.push({ type: "sleep", bodyA: body });
      }
    } else {
      if (body.sleeping) {
        this.events.push({ type: "wake", bodyA: body });
      }
      body.sleeping = false;
      body.restFrames = 0;
    }
  }

  isSupported(body: Body): boolean {
    const shape = body.shape;
    if (shape.type === "segment") return false;

    const hw = shapeHalfWidth(shape);
    const hh = shapeHalfHeight(shape);
    const left = body.x - hw;
    const right = body.x + hw;
    const bottom = body.y - hh;

    for (const box of this.getRelevantBoxes(left, right)) {
      if (
        box.x + box.hw > left + 1e-6 &&
        box.x - box.hw < right - 1e-6 &&
        Math.abs(bottom - (box.y + box.hh)) <= 1e-3
      )
        return true;
    }

    return false;
  }

  sweepBody(
    startX: number,
    startY: number,
    dx: number,
    dy: number,
    shape: BoxShape | CircleShape,
    excludeIds?: Set<string>,
  ): SweepResult {
    let best: SweepResult = { t: 1, normalX: 0, normalY: 0 };

    const isBox = shape.type === "box";
    const hw = isBox ? shape.halfWidth : 0;
    const hh = isBox ? shape.halfHeight : 0;
    const r = isBox ? 0 : shape.radius;

    for (const box of this.getRelevantBoxes(
      Math.min(startX, startX + dx) - (hw + r) - 1,
      Math.max(startX, startX + dx) + (hw + r) + 1,
    )) {
      let t: number;
      if (isBox) {
        t = sweepBoxVsBox(
          startX,
          startY,
          dx,
          dy,
          hw,
          hh,
          box.x,
          box.y,
          box.hw,
          box.hh,
        );
      } else {
        t = sweepCircleVsBox(
          startX,
          startY,
          dx,
          dy,
          r,
          box.x,
          box.y,
          box.hw,
          box.hh,
        );
      }
      if (t >= 0 && t < best.t) {
        const hitX = startX + dx * t;
        const hitY = startY + dy * t;
        let nx = 0;
        let ny = 0;
        if (hitX < box.x - box.hw + 0.01) nx = -1;
        else if (hitX > box.x + box.hw - 0.01) nx = 1;
        else if (hitY < box.y - box.hh + 0.01) ny = -1;
        else if (hitY > box.y + box.hh - 0.01) ny = 1;
        best = { t, normalX: nx, normalY: ny };
      }
    }

    for (const body of this.bodies.values()) {
      if (excludeIds?.has(body.id)) continue;
      if (body.shape.type === "segment") continue;

      const bhw = shapeHalfWidth(body.shape);
      const bhh = shapeHalfHeight(body.shape);

      let t: number;
      if (isBox) {
        t = sweepBoxVsBox(
          startX,
          startY,
          dx,
          dy,
          hw,
          hh,
          body.x,
          body.y,
          bhw,
          bhh,
        );
      } else if (body.shape.type === "circle") {
        t = sweepCircleVsCircle(
          startX,
          startY,
          dx,
          dy,
          r,
          body.x,
          body.y,
          body.shape.radius,
          false,
        );
      } else {
        t = sweepCircleVsBox(
          startX,
          startY,
          dx,
          dy,
          r,
          body.x,
          body.y,
          bhw,
          bhh,
        );
      }

      if (t >= 0 && t < best.t) {
        const hitX = startX + dx * t;
        const hitY = startY + dy * t;
        const ddx = hitX - body.x;
        const ddy = hitY - body.y;
        const len = Math.sqrt(ddx * ddx + ddy * ddy);
        best = {
          t,
          normalX: len > 1e-6 ? ddx / len : 0,
          normalY: len > 1e-6 ? ddy / len : 1,
          body,
        };
      }
    }

    return best;
  }

  sweepTerrain(x0: number, y0: number, dx: number, dy: number): number {
    let best = -1;

    for (const box of this.getRelevantBoxes(
      Math.min(x0, x0 + dx) - 1,
      Math.max(x0, x0 + dx) + 1,
    )) {
      const t = sweepPointVsBox(
        x0,
        y0,
        dx,
        dy,
        box.x - box.hw,
        box.y - box.hh,
        box.x + box.hw,
        box.y + box.hh,
      );
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }

    return best;
  }

  sweepSegment(
    x0: number,
    y0: number,
    dx: number,
    dy: number,
    segment: SegmentShape,
    segmentX: number,
  ): number {
    let ax = segment.x0 + segmentX;
    let bx = segment.x1 + segmentX;

    if (this.wrapX && this.width > 0) {
      const shift =
        wrapDelta(x0, (ax + bx) / 2, this.width) - ((ax + bx) / 2 - x0);
      ax += shift;
      bx += shift;
    }

    return sweepPointVsSegment(x0, y0, dx, dy, ax, segment.y0, bx, segment.y1);
  }

  raycast(
    x0: number,
    y0: number,
    dirX: number,
    dirY: number,
    maxDistance: number,
    layerMask: number = 0xffffffff,
  ): RaycastResult {
    const dx = dirX * maxDistance;
    const dy = dirY * maxDistance;
    let best: RaycastResult = {
      hit: false,
      t: 1,
      x: x0 + dx,
      y: y0 + dy,
      normalX: 0,
      normalY: 0,
    };

    const terrainT = this.sweepTerrain(x0, y0, dx, dy);
    if (terrainT >= 0 && terrainT < best.t) {
      best = {
        hit: true,
        t: terrainT,
        x: x0 + dx * terrainT,
        y: y0 + dy * terrainT,
        normalX: 0,
        normalY: -1,
      };
    }

    for (const body of this.bodies.values()) {
      if ((body.layer & layerMask) === 0) continue;

      const shape = body.shape;
      let t = -1;

      if (shape.type === "box") {
        t = sweepPointVsBox(
          x0,
          y0,
          dx,
          dy,
          body.x - shape.halfWidth,
          body.y - shape.halfHeight,
          body.x + shape.halfWidth,
          body.y + shape.halfHeight,
        );
      } else if (shape.type === "circle") {
        t = sweepCircleVsCircle(
          x0,
          y0,
          dx,
          dy,
          0,
          body.x,
          body.y,
          shape.radius,
          false,
        );
      }

      if (t >= 0 && t < best.t) {
        const hitX = x0 + dx * t;
        const hitY = y0 + dy * t;
        const ddx = hitX - body.x;
        const ddy = hitY - body.y;
        const len = Math.sqrt(ddx * ddx + ddy * ddy);
        best = {
          hit: true,
          t,
          x: hitX,
          y: hitY,
          normalX: len > 1e-6 ? ddx / len : 0,
          normalY: len > 1e-6 ? ddy / len : 1,
          body,
        };
      }
    }

    return best;
  }

  queryCircle(
    cx: number,
    cy: number,
    radius: number,
    layerMask: number = 0xffffffff,
  ): Body[] {
    const results: Body[] = [];

    for (const body of this.bodies.values()) {
      if ((body.layer & layerMask) === 0) continue;

      const shape = body.shape;
      let touching = false;

      if (shape.type === "box") {
        let bx = body.x;
        if (this.wrapX && this.width > 0) {
          bx = cx + wrapDelta(cx, body.x, this.width);
        }
        touching = boxTouchesCircle(
          bx,
          body.y,
          shape.halfWidth,
          shape.halfHeight,
          cx,
          cy,
          radius,
        );
      } else if (shape.type === "circle") {
        let bx = body.x;
        if (this.wrapX && this.width > 0) {
          bx = cx + wrapDelta(cx, body.x, this.width);
        }
        touching = circlesTouching(bx, body.y, shape.radius, cx, cy, radius);
      }

      if (touching) results.push(body);
    }

    return results;
  }

  queryAABB(aabb: AABB, layerMask: number = 0xffffffff): Body[] {
    const results: Body[] = [];

    for (const body of this.bodies.values()) {
      if ((body.layer & layerMask) === 0) continue;

      const bodyBox = bodyAABB(body);
      if (
        bodyBox.minX < aabb.maxX &&
        bodyBox.maxX > aabb.minX &&
        bodyBox.minY < aabb.maxY &&
        bodyBox.maxY > aabb.minY
      ) {
        results.push(body);
      }
    }

    return results;
  }

  wrapPosition(x: number): number {
    if (!this.wrapX || this.width <= 0) return x;
    return wrapX(x, this.width);
  }

  wrappedDelta(from: number, to: number): number {
    if (!this.wrapX || this.width <= 0) return to - from;
    return wrapDelta(from, to, this.width);
  }

  boxDistanceWrapped(
    px: number,
    py: number,
    bx: number,
    by: number,
    hw: number,
    hh: number,
  ): number {
    let dx: number;
    if (this.wrapX && this.width > 0) {
      dx = Math.abs(wrapDelta(px, bx, this.width));
    } else {
      dx = Math.abs(px - bx);
    }
    const clampedDx = Math.max(dx - hw, 0);
    const clampedDy = Math.max(Math.abs(py - by) - hh, 0);
    return Math.sqrt(clampedDx * clampedDx + clampedDy * clampedDy);
  }
}
