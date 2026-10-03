export type Vec2 = { x: number; y: number };

export type AABB = { minX: number; minY: number; maxX: number; maxY: number };

export type BodyType = "dynamic" | "static" | "kinematic";

export type ShapeType = "box" | "circle" | "segment";

export interface BoxShape {
  type: "box";
  halfWidth: number;
  halfHeight: number;
}

export interface CircleShape {
  type: "circle";
  radius: number;
}

export interface SegmentShape {
  type: "segment";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Shape = BoxShape | CircleShape | SegmentShape;

export interface BodyDef {
  id: string;
  type: BodyType;
  shape: Shape;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  gravityScale?: number;
  linearDamping?: number;
  layer?: number;
  mask?: number;
  isSensor?: boolean;
  data?: unknown;
}

export interface Body {
  id: string;
  type: BodyType;
  shape: Shape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  invMass: number;
  restitution: number;
  friction: number;
  gravityScale: number;
  linearDamping: number;
  layer: number;
  mask: number;
  isSensor: boolean;
  supported: boolean;
  sleeping: boolean;
  restFrames: number;
  data: unknown;
}

export type ContactType = "begin" | "end" | "preSolve" | "postSolve";

export interface Contact {
  bodyA: Body;
  bodyB: Body;
  normalX: number;
  normalY: number;
  depth: number;
  pointX: number;
  pointY: number;
}

export type PhysicsEventType =
  | "contactBegin"
  | "contactEnd"
  | "land"
  | "sensorEnter"
  | "sensorExit"
  | "wrap"
  | "sleep"
  | "wake";

export interface PhysicsEvent {
  type: PhysicsEventType;
  bodyA: Body;
  bodyB?: Body;
  data?: unknown;
}

export interface WorldConfig {
  gravity: number;
  dt: number;
  width?: number;
  wrapX?: boolean;
  friction?: number;
  restitution?: number;
  restSpeed?: number;
  restFrames?: number;
  waterY?: number;
  bucketSize?: number;
}

export interface SweepResult {
  t: number;
  normalX: number;
  normalY: number;
  body?: Body;
}

export interface RaycastResult {
  hit: boolean;
  t: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  body?: Body;
}
