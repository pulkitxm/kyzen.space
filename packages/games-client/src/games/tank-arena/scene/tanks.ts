import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PointLight,
  Shape,
  SphereGeometry,
} from "three";
import type { SceneTank, TankModelKind } from "../view";
import { mergeNonIndexed } from "./merge";

export const MODEL_SIZE: Record<
  TankModelKind,
  { halfWidth: number; height: number; muzzle: number; pivotY: number }
> = {
  bastion: { halfWidth: 1.4, height: 2.4, muzzle: 1.8, pivotY: 1.84 },
  kestrel: { halfWidth: 1.05, height: 1.8, muzzle: 2.08, pivotY: 1.2 },
};

const TREAD_RADIUS = 0.4;
const TREAD_HALF = 1.38 - TREAD_RADIUS;
const TEETH = 20;

function profile(points: [number, number][]) {
  const shape = new Shape();
  const [first, ...rest] = points;
  if (!first) return shape;
  shape.moveTo(first[0], first[1]);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();
  return shape;
}

function extrude(shape: Shape, depth: number, bevel = 0.05) {
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  return geometry;
}

function stadium(half: number, radius: number, inset: number) {
  const r = radius - inset;
  const shape = new Shape();
  shape.moveTo(-half, radius - r);
  shape.lineTo(half, radius - r);
  shape.absarc(half, radius, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-half, radius + r);
  shape.absarc(-half, radius, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return shape;
}

function treadShape() {
  const outer = stadium(TREAD_HALF, TREAD_RADIUS, 0);
  const inner = stadium(TREAD_HALF, TREAD_RADIUS, 0.09);
  const hole = new Path(inner.getPoints(24).reverse());
  outer.holes.push(hole);
  return outer;
}

function placed(geometry: BufferGeometry, x: number, y: number, z: number) {
  geometry.translate(x, y, z);
  return geometry;
}

type PartName =
  | "bastionHull"
  | "bastionTurret"
  | "bastionBarrel"
  | "tread"
  | "wheel"
  | "tooth"
  | "stripe"
  | "antenna"
  | "tip"
  | "lamp"
  | "kestrelHull"
  | "canopy"
  | "skid"
  | "fin"
  | "kestrelBarrel"
  | "nozzle"
  | "flame";

export type TankKit = {
  geometries: Record<PartName, BufferGeometry>;
  materials: {
    armor: MeshStandardMaterial;
    dark: MeshStandardMaterial;
    rubber: MeshStandardMaterial;
    glass: MeshStandardMaterial;
    flame: MeshBasicMaterial;
    glow: MeshBasicMaterial;
  };
  accent: (color: number) => MeshStandardMaterial;
  paint: (color: number) => MeshStandardMaterial;
  dispose: () => void;
};

export function createTankKit(): TankKit {
  const bastionHull = extrude(
    profile([
      [-1.36, 0.6],
      [1.3, 0.6],
      [1.46, 0.98],
      [1.18, 1.5],
      [-1.18, 1.5],
      [-1.42, 1.04],
    ]),
    1.56,
    0.07,
  );
  const rivets: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    for (const y of [0.78, 1.32]) {
      const rivet = new CylinderGeometry(0.05, 0.05, 0.05, 6);
      rivet.rotateX(Math.PI / 2);
      rivets.push(placed(rivet, -1.05 + i * 0.3, y, 0.8));
    }
  }
  const skirt = placed(new BoxGeometry(2.6, 0.14, 1.78), 0, 0.84, 0);
  const plate = placed(new BoxGeometry(1.1, 0.42, 0.06), -0.3, 1.06, 0.8);
  const bastionHullGeometry = mergeNonIndexed([
    bastionHull,
    skirt,
    plate,
    ...rivets,
  ]);
  const bastionTurret = extrude(
    profile([
      [-0.88, 0],
      [0.66, 0],
      [0.82, 0.3],
      [0.52, 0.66],
      [-0.7, 0.66],
      [-0.94, 0.32],
    ]),
    1.2,
    0.07,
  );
  bastionTurret.translate(-0.12, 1.46, 0);
  const heavyBarrel = new CylinderGeometry(0.15, 0.17, 1.45, 16);
  heavyBarrel.rotateZ(-Math.PI / 2);
  heavyBarrel.translate(0.86, 0, 0);
  const brake = new CylinderGeometry(0.22, 0.22, 0.3, 12);
  brake.rotateZ(-Math.PI / 2);
  brake.translate(1.62, 0, 0);
  const mantlet = new BoxGeometry(0.42, 0.42, 0.56);
  mantlet.translate(0.12, 0, 0);
  const bastionBarrel = mergeNonIndexed([heavyBarrel, brake, mantlet]);
  const tread = extrude(treadShape(), 0.48, 0.035);
  const wheel = new CylinderGeometry(0.27, 0.27, 0.36, 16);
  wheel.rotateX(Math.PI / 2);
  const tooth = new BoxGeometry(0.17, 0.08, 0.5);
  const stripe = new BoxGeometry(2.1, 0.1, 0.04);
  const antenna = new CylinderGeometry(0.02, 0.02, 0.9, 5);
  antenna.translate(0, 0.45, 0);
  const tip = new SphereGeometry(0.075, 8, 6);
  const lamp = new BoxGeometry(0.1, 0.14, 0.34);

  const kestrelHull = extrude(
    profile([
      [-1.0, 0.46],
      [0.74, 0.46],
      [1.08, 0.74],
      [0.74, 1.14],
      [-0.52, 1.26],
      [-1.06, 0.96],
    ]),
    1.1,
    0.08,
  );
  const canopy = new SphereGeometry(
    0.44,
    20,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  canopy.scale(1.35, 0.8, 0.95);
  canopy.translate(0.08, 1.12, 0);
  const skid = new CapsuleGeometry(0.08, 1.7, 4, 8);
  skid.rotateZ(Math.PI / 2);
  skid.translate(0, 0.1, 0);
  const strutA = new BoxGeometry(0.07, 0.4, 0.07);
  strutA.translate(-0.5, 0.32, 0);
  const strutB = new BoxGeometry(0.07, 0.4, 0.07);
  strutB.translate(0.5, 0.32, 0);
  const skidGeometry = mergeNonIndexed([skid, strutA, strutB]);
  const fin = extrude(
    profile([
      [0, 0],
      [0.5, 0],
      [0.06, 0.6],
      [-0.16, 0.6],
    ]),
    0.07,
    0.015,
  );
  const slimBarrel = new CylinderGeometry(0.06, 0.075, 1.9, 12);
  slimBarrel.rotateZ(-Math.PI / 2);
  slimBarrel.translate(1.05, 0, 0);
  const tipRing = new CylinderGeometry(0.1, 0.1, 0.18, 12);
  tipRing.rotateZ(-Math.PI / 2);
  tipRing.translate(1.98, 0, 0);
  const collar = new CylinderGeometry(0.18, 0.18, 0.3, 14);
  collar.rotateX(Math.PI / 2);
  const kestrelBarrel = mergeNonIndexed([slimBarrel, tipRing, collar]);
  const nozzle = new ConeGeometry(0.18, 0.36, 12, 1, true);
  nozzle.rotateZ(Math.PI / 2);
  const flame = new ConeGeometry(0.14, 1.0, 10, 1, true);
  flame.rotateZ(Math.PI / 2);
  flame.translate(-0.5, 0, 0);

  const geometries = {
    bastionHull: bastionHullGeometry,
    bastionTurret,
    bastionBarrel,
    tread,
    wheel,
    tooth,
    stripe,
    antenna,
    tip,
    lamp,
    kestrelHull,
    canopy,
    skid: skidGeometry,
    fin,
    kestrelBarrel,
    nozzle,
    flame,
  };

  const materials = {
    armor: new MeshStandardMaterial({
      color: 0x7a8a98,
      metalness: 0.6,
      roughness: 0.32,
    }),
    dark: new MeshStandardMaterial({
      color: 0x1a2028,
      metalness: 0.6,
      roughness: 0.45,
    }),
    rubber: new MeshStandardMaterial({
      color: 0x121518,
      metalness: 0.08,
      roughness: 0.9,
    }),
    glass: new MeshStandardMaterial({
      color: 0x0a2030,
      metalness: 0.25,
      roughness: 0.05,
      emissive: 0x30a0d0,
      emissiveIntensity: 1.2,
    }),
    flame: new MeshBasicMaterial({
      color: 0x80e0ff,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
    glow: new MeshBasicMaterial({
      color: 0xffa060,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  };
  const accents = new Map<number, MeshStandardMaterial>();
  const paints = new Map<number, MeshStandardMaterial>();
  const base = new Color(0x6f7f8c);

  return {
    geometries,
    materials,
    accent: (color) => {
      let material = accents.get(color);
      if (!material) {
        material = new MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.85,
          metalness: 0.3,
          roughness: 0.35,
        });
        accents.set(color, material);
      }
      return material;
    },
    paint: (color) => {
      let material = paints.get(color);
      if (!material) {
        material = new MeshStandardMaterial({
          color: base.clone().lerp(new Color(color), 0.55),
          emissive: color,
          emissiveIntensity: 0.12,
          metalness: 0.5,
          roughness: 0.4,
        });
        paints.set(color, material);
      }
      return material;
    },
    dispose: () => {
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      for (const material of accents.values()) material.dispose();
      for (const material of paints.values()) material.dispose();
      accents.clear();
      paints.clear();
    },
  };
}

function part(
  kit: TankKit,
  name: PartName,
  material: Material,
  shadows = true,
): Mesh {
  const mesh = new Mesh(kit.geometries[name], material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function treadPoint(s: number) {
  const straight = TREAD_HALF * 2;
  const arc = Math.PI * TREAD_RADIUS;
  const perimeter = straight * 2 + arc * 2;
  let d = ((s % perimeter) + perimeter) % perimeter;
  if (d < straight) return { x: -TREAD_HALF + d, y: 0.02, angle: 0 };
  d -= straight;
  if (d < arc) {
    const theta = -Math.PI / 2 + d / TREAD_RADIUS;
    return {
      x: TREAD_HALF + Math.cos(theta) * (TREAD_RADIUS - 0.02),
      y: TREAD_RADIUS + Math.sin(theta) * (TREAD_RADIUS - 0.02),
      angle: theta + Math.PI / 2,
    };
  }
  d -= arc;
  if (d < straight) {
    return { x: TREAD_HALF - d, y: TREAD_RADIUS * 2 - 0.02, angle: Math.PI };
  }
  d -= straight;
  const theta = Math.PI / 2 + d / TREAD_RADIUS;
  return {
    x: -TREAD_HALF + Math.cos(theta) * (TREAD_RADIUS - 0.02),
    y: TREAD_RADIUS + Math.sin(theta) * (TREAD_RADIUS - 0.02),
    angle: theta + Math.PI / 2,
  };
}

const TREAD_PERIMETER = TREAD_HALF * 4 + Math.PI * TREAD_RADIUS * 2;
const scratch = new Object3D();
const scratchMatrix = new Matrix4();

export class TankModel {
  readonly root = new Group();
  readonly body = new Group();
  readonly pivot = new Group();
  readonly barrel = new Group();
  readonly kind: TankModelKind;
  private readonly wheels: Mesh[] = [];
  private readonly teeth: InstancedMesh | null;
  private readonly flames: Mesh[] = [];
  private readonly lights: PointLight[] = [];
  private readonly paintMeshes: Mesh[] = [];
  private readonly accentMeshes: Mesh[] = [];
  private readonly detailed: boolean;
  private readonly basePaintColor: Color;
  private readonly baseAccentColor: Color;
  private facing = 1;
  private recoil = 0;
  private squash = 0;
  private travel = 0;
  private thrust = 0;
  private visible = true;
  private hitFlash = 0;
  private damageLevel = 0;
  private muzzleFlash = 0;
  private muzzleLight: PointLight | null = null;

  constructor(
    kit: TankKit,
    kind: TankModelKind,
    color: number,
    detailed: boolean,
  ) {
    this.kind = kind;
    this.detailed = detailed;
    this.basePaintColor = new Color(color);
    this.baseAccentColor = new Color(color);
    this.root.add(this.body);
    const accent = kit.accent(color);
    const paint = kit.paint(color);
    const size = MODEL_SIZE[kind];
    this.pivot.position.set(kind === "bastion" ? 0.36 : 0.34, size.pivotY, 0);
    this.pivot.add(this.barrel);
    this.body.add(this.pivot);

    if (kind === "bastion") {
      this.body.add(part(kit, "bastionHull", kit.materials.armor));
      const turret = part(kit, "bastionTurret", paint);
      this.paintMeshes.push(turret);
      this.body.add(turret);
      this.barrel.add(part(kit, "bastionBarrel", kit.materials.dark));
      for (const z of [-0.7, 0.7]) {
        const tread = part(kit, "tread", kit.materials.rubber);
        tread.position.z = z;
        this.body.add(tread);
        if (detailed) {
          for (let i = 0; i < 4; i++) {
            const wheel = part(kit, "wheel", kit.materials.dark, false);
            wheel.position.set(
              -TREAD_HALF + (i * TREAD_HALF * 2) / 3,
              TREAD_RADIUS,
              z,
            );
            this.wheels.push(wheel);
            this.body.add(wheel);
          }
        }
      }
      const stripe = part(kit, "stripe", accent, false);
      stripe.position.set(-0.05, 1.42, 0.8);
      this.accentMeshes.push(stripe);
      this.body.add(stripe);
      const lamp = part(kit, "lamp", accent, false);
      lamp.position.set(1.42, 1.0, 0.45);
      this.accentMeshes.push(lamp);
      this.body.add(lamp);
      const antenna = part(kit, "antenna", kit.materials.dark, false);
      antenna.position.set(-0.7, 2.06, -0.4);
      antenna.rotation.z = 0.28;
      this.body.add(antenna);
      const tip = part(kit, "tip", accent, false);
      tip.position.set(-0.94, 2.92, -0.4);
      this.accentMeshes.push(tip);
      this.body.add(tip);
      this.teeth = detailed
        ? new InstancedMesh(kit.geometries.tooth, kit.materials.dark, TEETH * 2)
        : null;
      if (this.teeth) {
        this.teeth.castShadow = false;
        this.body.add(this.teeth);
      }
      if (detailed) {
        const headlight = new PointLight(color, 2, 6);
        headlight.position.set(1.5, 1.0, 0);
        this.lights.push(headlight);
        this.body.add(headlight);
        const muzzleLight = new PointLight(0xffd080, 0, 10);
        muzzleLight.position.set(size.muzzle, 0, 0);
        this.muzzleLight = muzzleLight;
        this.barrel.add(muzzleLight);
      }
    } else {
      const hull = part(kit, "kestrelHull", paint);
      this.paintMeshes.push(hull);
      this.body.add(hull);
      const canopy = part(kit, "canopy", accent, false);
      this.accentMeshes.push(canopy);
      this.body.add(canopy);
      this.barrel.add(part(kit, "kestrelBarrel", kit.materials.dark));
      for (const z of [-0.48, 0.48]) {
        const skid = part(kit, "skid", kit.materials.dark);
        skid.position.z = z;
        this.body.add(skid);
      }
      for (const z of [-0.4, 0.4]) {
        const fin = part(kit, "fin", accent, false);
        fin.position.set(-0.86, 1.08, z);
        fin.rotation.x = z > 0 ? -0.35 : 0.35;
        this.accentMeshes.push(fin);
        this.body.add(fin);
        const nozzle = part(kit, "nozzle", kit.materials.dark, false);
        nozzle.position.set(-1.14, 0.78, z * 0.8);
        this.body.add(nozzle);
        const flame = new Mesh(kit.geometries.flame, kit.materials.flame);
        flame.position.set(-1.24, 0.78, z * 0.8);
        flame.scale.setScalar(0.4);
        this.flames.push(flame);
        this.body.add(flame);
      }
      this.teeth = null;
      if (detailed) {
        const thrusterGlow = new PointLight(0x60c0ff, 3, 5);
        thrusterGlow.position.set(-1.3, 0.78, 0);
        this.lights.push(thrusterGlow);
        this.body.add(thrusterGlow);
        const muzzleLight = new PointLight(0xffd080, 0, 8);
        muzzleLight.position.set(size.muzzle, 0, 0);
        this.muzzleLight = muzzleLight;
        this.barrel.add(muzzleLight);
      }
    }
    this.layoutTeeth();
  }

  dispose() {
    this.teeth?.dispose();
  }

  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.visible = visible;
  }

  fire() {
    this.recoil = 1;
    this.muzzleFlash = 1;
  }

  land() {
    this.squash = 1;
  }

  boost() {
    this.thrust = 1;
  }

  hit() {
    this.hitFlash = 1;
  }

  setDamage(level: number) {
    this.damageLevel = Math.min(1, Math.max(0, level));
  }

  muzzleWorld(target: { x: number; y: number }) {
    const size = MODEL_SIZE[this.kind];
    scratch.position.set(size.muzzle, 0, 0);
    this.barrel.updateWorldMatrix(true, false);
    scratch.position.applyMatrix4(this.barrel.matrixWorld);
    target.x = scratch.position.x;
    target.y = scratch.position.y;
    return target;
  }

  private layoutTeeth() {
    const teeth = this.teeth;
    if (!teeth) return;
    let index = 0;
    for (const z of [-0.7, 0.7]) {
      for (let i = 0; i < TEETH; i++) {
        const point = treadPoint((i / TEETH) * TREAD_PERIMETER - this.travel);
        scratch.position.set(point.x, point.y, z);
        scratch.rotation.set(0, 0, point.angle);
        scratch.scale.setScalar(1);
        scratch.updateMatrix();
        scratchMatrix.copy(scratch.matrix);
        teeth.setMatrixAt(index, scratchMatrix);
        index += 1;
      }
    }
    teeth.instanceMatrix.needsUpdate = true;
  }

  update(tank: SceneTank, dt: number, time: number, scale: number) {
    const aimRad = (tank.aim * Math.PI) / 180;
    const cos = Math.cos(aimRad);
    if (cos > 0.08) this.facing = 1;
    else if (cos < -0.08) this.facing = -1;
    const targetYaw = this.facing > 0 ? 0 : Math.PI;
    this.root.rotation.y +=
      (targetYaw - this.root.rotation.y) * (1 - Math.exp(-dt * 10));
    const elevation = this.facing > 0 ? aimRad : Math.PI - aimRad;
    let delta = elevation - this.pivot.rotation.z;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.pivot.rotation.z += delta * (1 - Math.exp(-dt * 14));

    this.recoil = Math.max(0, this.recoil - dt * 3.2);
    this.barrel.position.x = -0.32 * this.recoil * this.recoil;

    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 8);
    if (this.muzzleLight) {
      this.muzzleLight.intensity = this.muzzleFlash * this.muzzleFlash * 40;
    }

    this.squash = Math.max(0, this.squash - dt * 3);
    const s = Math.sin(this.squash * Math.PI) * 0.22;
    const bob =
      this.kind === "kestrel"
        ? Math.sin(time * 3.1 + tank.x) * 0.05 + 0.1
        : Math.sin(time * 18 + tank.x) * 0.006;
    this.body.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
    this.body.position.y = bob;
    this.root.scale.setScalar(scale);
    this.root.position.set(tank.x, tank.y, 0);

    const moving = Math.abs(tank.vx) > 0.02;
    if (moving) {
      const local = tank.vx * this.facing * dt;
      this.travel += local;
      for (const wheel of this.wheels) wheel.rotation.z -= local / 0.27;
      if (this.detailed) this.layoutTeeth();
    }

    if (this.flames.length > 0) {
      const airborne = Math.abs(tank.vy) > 0.4;
      const target = tank.leaping ? 1.6 : airborne ? 0.9 : 0.35;
      this.thrust += (target - this.thrust) * (1 - Math.exp(-dt * 8));
      const flicker = 0.85 + Math.sin(time * 40 + tank.x * 3) * 0.15;
      for (const flame of this.flames) {
        flame.scale.set(
          this.thrust * flicker,
          0.6 + this.thrust * 0.3,
          0.6 + this.thrust * 0.3,
        );
      }
      for (const light of this.lights) {
        light.intensity = 2 + this.thrust * 4;
      }
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    const flash = this.hitFlash * this.hitFlash;
    const white = new Color(0xffffff);
    const scorched = new Color(0x2a1a0a);
    const dmg = this.damageLevel * 0.6;
    for (const mesh of this.paintMeshes) {
      const material = mesh.material as MeshStandardMaterial;
      material.emissive
        .copy(this.basePaintColor)
        .lerp(scorched, dmg)
        .lerp(white, flash);
      material.emissiveIntensity = 0.12 + flash * 2;
    }
    for (const mesh of this.accentMeshes) {
      const material = mesh.material as MeshStandardMaterial;
      const intensity = 0.85 * (1 - dmg * 0.5) + flash * 2;
      material.emissive.copy(this.baseAccentColor).lerp(white, flash);
      material.emissiveIntensity = intensity;
    }
    for (const light of this.lights) {
      light.intensity *= 1 - dmg * 0.4;
    }
  }
}
