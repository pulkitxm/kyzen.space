import type { Body, BodyDef, Shape } from "./types";

const DEFAULT_LAYER = 1;
const DEFAULT_MASK = 0xffffffff;

export function createBody(def: BodyDef): Body {
  const mass = def.type === "dynamic" ? (def.mass ?? 1) : 0;
  return {
    id: def.id,
    type: def.type,
    shape: def.shape,
    x: def.x,
    y: def.y,
    vx: def.vx ?? 0,
    vy: def.vy ?? 0,
    mass,
    invMass: mass > 0 ? 1 / mass : 0,
    restitution: def.restitution ?? 0.15,
    friction: def.friction ?? 14,
    gravityScale: def.gravityScale ?? 1,
    linearDamping: def.linearDamping ?? 0,
    layer: def.layer ?? DEFAULT_LAYER,
    mask: def.mask ?? DEFAULT_MASK,
    isSensor: def.isSensor ?? false,
    supported: false,
    sleeping: false,
    restFrames: 0,
    data: def.data,
  };
}

export function canCollide(a: Body, b: Body): boolean {
  return (a.layer & b.mask) !== 0 && (b.layer & a.mask) !== 0;
}

export function applyImpulse(body: Body, ix: number, iy: number): void {
  if (body.invMass === 0) return;
  body.vx += ix * body.invMass;
  body.vy += iy * body.invMass;
  body.sleeping = false;
  body.restFrames = 0;
}

export function applyForce(
  body: Body,
  fx: number,
  fy: number,
  dt: number,
): void {
  if (body.invMass === 0) return;
  body.vx += fx * body.invMass * dt;
  body.vy += fy * body.invMass * dt;
}

export function setVelocity(body: Body, vx: number, vy: number): void {
  body.vx = vx;
  body.vy = vy;
  body.sleeping = false;
  body.restFrames = 0;
}

export function setPosition(body: Body, x: number, y: number): void {
  body.x = x;
  body.y = y;
}

export function launch(body: Body, vx: number, vy: number): void {
  body.vx = vx;
  body.vy = vy;
  body.supported = false;
  body.sleeping = false;
  body.restFrames = 0;
}

export function shapeHalfWidth(shape: Shape): number {
  if (shape.type === "box") return shape.halfWidth;
  if (shape.type === "circle") return shape.radius;
  return Math.abs(shape.x1 - shape.x0) / 2;
}

export function shapeHalfHeight(shape: Shape): number {
  if (shape.type === "box") return shape.halfHeight;
  if (shape.type === "circle") return shape.radius;
  return Math.abs(shape.y1 - shape.y0) / 2;
}

export function bodySpeed(body: Body): number {
  return Math.sqrt(body.vx * body.vx + body.vy * body.vy);
}
