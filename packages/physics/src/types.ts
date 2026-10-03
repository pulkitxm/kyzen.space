export type Aabb = { minX: number; minY: number; maxX: number; maxY: number };

export type BoxShape = { type: "box"; halfWidth: number; halfHeight: number };

export type CircleShape = { type: "circle"; radius: number };

export type SegmentShape = {
  type: "segment";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type PointShape = { type: "point" };

export type StaticShape = BoxShape | CircleShape | SegmentShape;

export type Shape = StaticShape | PointShape;

export type BodyKind = "dynamic" | "bullet" | "static";

export type Filter = { layer?: number; mask?: number; group?: number };

type CommonDef<T> = Filter & { x: number; y: number; data: T };

export type DynamicDef<T> = CommonDef<T> & {
  kind: "dynamic";
  shape: BoxShape;
  mass: number;
  vx?: number;
  vy?: number;
  friction?: number;
  restitution?: number;
  gravityScale?: number;
};

export type BulletDef<T> = CommonDef<T> & {
  kind: "bullet";
  vx: number;
  vy: number;
  mass?: number;
  gravityScale?: number;
};

export type StaticDef<T> = CommonDef<T> & {
  kind: "static";
  shape: StaticShape;
  sensor?: boolean;
  follow?: Body<T>;
};

export type BodyDef<T> = DynamicDef<T> | BulletDef<T> | StaticDef<T>;

export type Body<T> = {
  readonly id: number;
  readonly kind: BodyKind;
  readonly shape: Shape;
  readonly mass: number;
  readonly invMass: number;
  readonly sensor: boolean;
  readonly follow: Body<T> | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  friction: number;
  restitution: number;
  gravityScale: number;
  layer: number;
  mask: number;
  group: number;
  supported: boolean;
  restSteps: number;
  sleeping: boolean;
  removed: boolean;
  cell: number;
  data: T;
};

export type PhysicsEvent<T> =
  | { type: "land"; body: Body<T> }
  | { type: "wrap"; body: Body<T>; fromX: number; toX: number }
  | { type: "fall"; body: Body<T> }
  | {
      type: "hit";
      body: Body<T>;
      other: Body<T> | null;
      x: number;
      y: number;
      normalX: number;
      normalY: number;
    }
  | { type: "sensor"; body: Body<T>; sensor: Body<T> };

export type RayHit<T> = {
  t: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  body: Body<T> | null;
};
