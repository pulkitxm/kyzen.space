import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  type ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type {
  AimPreview,
  PickupModelKind,
  SceneMine,
  ScenePickup,
  SceneProjectile,
  SceneTank,
  SceneWall,
} from "../view";
import type { ParticleField } from "./effects";
import { mergeNonIndexed } from "./merge";
import {
  hazardMaterial,
  hologramMaterial,
  setUniform,
  shieldMaterial,
  wallMaterial,
} from "./shaders";

const PROJECTILE_CAPACITY = 512;
const matrix = new Matrix4();
const quaternion = new Quaternion();
const forward = new Vector3(1, 0, 0);
const direction = new Vector3();
const position = new Vector3();
const scale = new Vector3();
const color = new Color();

export const PICKUP_COLORS: Record<PickupModelKind, number> = {
  repair: 0x4dff9a,
  overcharge: 0xffa53d,
  plating: 0x6aa8ff,
  coolant: 0x6ff3ff,
};

const TRAIL_COLORS: Record<SceneProjectile["kind"], number> = {
  missile: 0xffc46b,
  shell: 0xff9a4a,
  rocket: 0xb48cff,
  bomblet: 0xffe28a,
  bomb: 0xff6a3a,
};

export class Projectiles {
  readonly root = new Group();
  private readonly shells: InstancedMesh;
  private readonly bombs: InstancedMesh;
  private readonly shellGeometry: BufferGeometry;
  private readonly bombGeometry: BufferGeometry;
  private readonly shellMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffd9a0,
    emissiveIntensity: 1.6,
    metalness: 0.2,
    roughness: 0.4,
  });
  private readonly bombMaterial = new MeshStandardMaterial({
    color: 0x2a2f36,
    metalness: 0.7,
    roughness: 0.4,
    emissive: 0xff5a1a,
    emissiveIntensity: 0.45,
  });

  constructor() {
    const shell = new SphereGeometry(0.16, 10, 8);
    shell.scale(1.9, 1, 1);
    this.shellGeometry = shell;
    const body = new SphereGeometry(0.32, 12, 10);
    body.scale(1.6, 1, 1);
    const fins = new BoxGeometry(0.3, 0.6, 0.06);
    fins.translate(-0.55, 0, 0);
    const fins2 = new BoxGeometry(0.3, 0.06, 0.6);
    fins2.translate(-0.55, 0, 0);
    this.bombGeometry = mergeNonIndexed([body, fins, fins2]);
    this.shells = new InstancedMesh(
      this.shellGeometry,
      this.shellMaterial,
      PROJECTILE_CAPACITY,
    );
    this.bombs = new InstancedMesh(this.bombGeometry, this.bombMaterial, 64);
    for (const mesh of [this.shells, this.bombs]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.root.add(mesh);
    }
  }

  update(projectiles: SceneProjectile[], sparks: ParticleField, dt: number) {
    let shellCount = 0;
    let bombCount = 0;
    for (const projectile of projectiles) {
      const isBomb = projectile.kind === "bomb";
      const mesh = isBomb ? this.bombs : this.shells;
      const index = isBomb ? bombCount : shellCount;
      if (index >= (isBomb ? 64 : PROJECTILE_CAPACITY)) continue;
      direction.set(projectile.vx, projectile.vy, 0);
      if (direction.lengthSq() < 1e-6) direction.set(1, 0, 0);
      direction.normalize();
      quaternion.setFromUnitVectors(forward, direction);
      position.set(projectile.x, projectile.y, 0);
      scale.setScalar(projectile.kind === "bomblet" ? 0.7 : 1);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (!isBomb) {
        color.setHex(projectile.color);
        mesh.setColorAt(index, color);
      }
      if (isBomb) bombCount += 1;
      else shellCount += 1;
      if (dt > 0) {
        const trail = TRAIL_COLORS[projectile.kind];
        const puffs = isBomb ? 2 : 1;
        for (let i = 0; i < puffs; i++) {
          sparks.spawn({
            x: projectile.x - direction.x * (0.25 + i * 0.3),
            y: projectile.y - direction.y * (0.25 + i * 0.3),
            vx: -projectile.vx * 0.05 + (Math.random() - 0.5),
            vy: -projectile.vy * 0.05 + (Math.random() - 0.5),
            life: isBomb ? 0.6 : 0.35,
            size: isBomb ? 1.1 : 0.38,
            color: trail,
            drag: 1.5,
            alpha: 0.9,
          });
        }
      }
    }
    this.shells.count = shellCount;
    this.bombs.count = bombCount;
    this.shells.instanceMatrix.needsUpdate = true;
    this.bombs.instanceMatrix.needsUpdate = true;
    if (this.shells.instanceColor) this.shells.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.shells.dispose();
    this.bombs.dispose();
    this.shellGeometry.dispose();
    this.bombGeometry.dispose();
    this.shellMaterial.dispose();
    this.bombMaterial.dispose();
  }
}

type ShieldEntry = {
  mesh: Mesh;
  material: ShaderMaterial;
  opacity: number;
  target: number;
};

export class Shields {
  readonly root = new Group();
  private readonly geometry = new SphereGeometry(1, 32, 20);
  private readonly entries = new Map<string, ShieldEntry>();

  update(tanks: SceneTank[], dt: number, time: number) {
    const seen = new Set<string>();
    for (const tank of tanks) {
      if (tank.shield <= 0 || !tank.alive) continue;
      seen.add(tank.role);
      let entry = this.entries.get(tank.role);
      if (!entry) {
        const material = shieldMaterial(tank.color);
        const mesh = new Mesh(this.geometry, material);
        mesh.renderOrder = 12;
        entry = { mesh, material, opacity: 0, target: 1 };
        this.entries.set(tank.role, entry);
        this.root.add(mesh);
      }
      entry.target = 1;
      entry.mesh.position.set(tank.x, tank.y + tank.height / 2, 0);
      entry.mesh.scale.setScalar(tank.shield);
    }
    for (const [role, entry] of this.entries) {
      if (!seen.has(role)) entry.target = 0;
      entry.opacity += (entry.target - entry.opacity) * (1 - Math.exp(-dt * 9));
      setUniform(entry.material, "uOpacity", entry.opacity);
      setUniform(entry.material, "uTime", time);
      entry.mesh.visible = entry.opacity > 0.01;
    }
  }

  dispose() {
    for (const entry of this.entries.values()) entry.material.dispose();
    this.entries.clear();
    this.geometry.dispose();
  }
}

type WallEntry = { mesh: Mesh; material: ShaderMaterial; seen: boolean };

export class Walls {
  readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 0.32, 2.2);
  private readonly entries = new Map<string, WallEntry>();

  update(walls: SceneWall[], time: number) {
    for (const entry of this.entries.values()) entry.seen = false;
    for (const wall of walls) {
      let entry = this.entries.get(wall.id);
      if (!entry) {
        const material = wallMaterial(wall.color);
        const mesh = new Mesh(this.geometry, material);
        mesh.renderOrder = 13;
        entry = { mesh, material, seen: true };
        this.entries.set(wall.id, entry);
        this.root.add(mesh);
      }
      entry.seen = true;
      const dx = wall.x1 - wall.x0;
      const dy = wall.y1 - wall.y0;
      entry.mesh.position.set(
        (wall.x0 + wall.x1) / 2,
        (wall.y0 + wall.y1) / 2,
        0,
      );
      entry.mesh.rotation.z = Math.atan2(dy, dx);
      entry.mesh.scale.set(Math.hypot(dx, dy), 1, 1);
      setUniform(entry.material, "uTime", time);
    }
    for (const [id, entry] of this.entries) {
      if (entry.seen) continue;
      this.root.remove(entry.mesh);
      entry.material.dispose();
      this.entries.delete(id);
    }
  }

  dispose() {
    for (const entry of this.entries.values()) entry.material.dispose();
    this.entries.clear();
    this.geometry.dispose();
  }
}

export class Mines {
  readonly root = new Group();
  private readonly body: BufferGeometry;
  private readonly core = new SphereGeometry(0.2, 10, 8);
  private readonly bodyMaterial = new MeshStandardMaterial({
    color: 0x262a30,
    metalness: 0.75,
    roughness: 0.35,
  });
  private readonly coreMaterial = new MeshStandardMaterial({
    color: 0x330000,
    emissive: 0xff2a3a,
    emissiveIntensity: 2,
  });
  private readonly entries = new Map<string, Group>();

  constructor() {
    const parts: BufferGeometry[] = [new IcosahedronGeometry(0.42, 0)];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0.7, 0.7],
      [-0.7, 0.7],
    ] as const;
    for (const [dx, dy] of dirs) {
      const spike = new ConeGeometry(0.08, 0.32, 6);
      spike.rotateZ(Math.atan2(dy, dx) - Math.PI / 2);
      spike.translate(dx * 0.48, dy * 0.48, 0);
      parts.push(spike);
    }
    this.body = mergeNonIndexed(parts);
  }

  update(mines: SceneMine[], time: number) {
    const seen = new Set<string>();
    for (const mine of mines) {
      seen.add(mine.id);
      let group = this.entries.get(mine.id);
      if (!group) {
        group = new Group();
        const body = new Mesh(this.body, this.bodyMaterial);
        body.castShadow = true;
        const core = new Mesh(this.core, this.coreMaterial);
        core.position.set(0, 0.06, 0.38);
        group.add(body, core);
        this.entries.set(mine.id, group);
        this.root.add(group);
      }
      group.position.set(mine.x, mine.y + 0.45, 0);
      group.scale.setScalar(1.35);
      group.rotation.y = time * 0.6;
    }
    for (const [id, group] of this.entries) {
      if (seen.has(id)) continue;
      this.root.remove(group);
      this.entries.delete(id);
    }
    const blink = Math.sin(time * 6) > 0.2 ? 3.2 : 0.4;
    this.coreMaterial.emissiveIntensity = blink;
  }

  dispose() {
    this.entries.clear();
    this.body.dispose();
    this.core.dispose();
    this.bodyMaterial.dispose();
    this.coreMaterial.dispose();
  }
}

export class Pickups {
  readonly root = new Group();
  private readonly shapes: Record<PickupModelKind, BufferGeometry>;
  private readonly materials: Record<PickupModelKind, ShaderMaterial>;
  private readonly base = new TorusGeometry(0.55, 0.05, 8, 32);
  private readonly entries = new Map<string, Group>();

  constructor() {
    const plus = mergeNonIndexed([
      new BoxGeometry(0.62, 0.2, 0.2),
      new BoxGeometry(0.2, 0.62, 0.2),
    ]);
    const bolt = new OctahedronGeometry(0.36, 0);
    bolt.scale(0.7, 1.2, 0.7);
    const plate = new CylinderGeometry(0.38, 0.38, 0.12, 6);
    plate.rotateX(Math.PI / 2);
    const crystal = mergeNonIndexed([
      new BoxGeometry(0.12, 0.7, 0.12),
      new BoxGeometry(0.7, 0.12, 0.12),
      (() => {
        const diagonal = new BoxGeometry(0.12, 0.7, 0.12);
        diagonal.rotateZ(Math.PI / 4);
        return diagonal;
      })(),
      (() => {
        const diagonal = new BoxGeometry(0.12, 0.7, 0.12);
        diagonal.rotateZ(-Math.PI / 4);
        return diagonal;
      })(),
    ]);
    this.shapes = {
      repair: plus,
      overcharge: bolt,
      plating: plate,
      coolant: crystal,
    };
    this.materials = {
      repair: hologramMaterial(PICKUP_COLORS.repair),
      overcharge: hologramMaterial(PICKUP_COLORS.overcharge),
      plating: hologramMaterial(PICKUP_COLORS.plating),
      coolant: hologramMaterial(PICKUP_COLORS.coolant),
    };
  }

  update(pickups: ScenePickup[], time: number) {
    const seen = new Set<string>();
    for (const pickup of pickups) {
      seen.add(pickup.id);
      let group = this.entries.get(pickup.id);
      if (!group) {
        group = new Group();
        const material = this.materials[pickup.kind];
        const shape = new Mesh(this.shapes[pickup.kind], material);
        shape.name = "shape";
        const ring = new Mesh(this.base, material);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.55;
        group.add(shape, ring);
        this.entries.set(pickup.id, group);
        this.root.add(group);
      }
      const shape = group.getObjectByName("shape");
      if (shape) {
        shape.rotation.y = time * 2.2;
        shape.position.y = Math.sin(time * 2.6 + pickup.x) * 0.12;
      }
      group.position.set(pickup.x, pickup.y, 0);
      group.scale.setScalar(1.45);
    }
    for (const [id, group] of this.entries) {
      if (seen.has(id)) continue;
      this.root.remove(group);
      this.entries.delete(id);
    }
    for (const material of Object.values(this.materials)) {
      setUniform(material, "uTime", time);
    }
  }

  dispose() {
    this.entries.clear();
    for (const geometry of Object.values(this.shapes)) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.base.dispose();
  }
}

export class AirstrikeColumns {
  readonly root = new Group();
  private readonly material = hazardMaterial();
  private readonly geometry = new PlaneGeometry(1, 1);
  private columns: Mesh[] = [];

  set(columns: number[] | null, waterY: number, radius: number) {
    for (const mesh of this.columns) this.root.remove(mesh);
    this.columns = [];
    if (!columns) return;
    for (const x of columns) {
      const mesh = new Mesh(this.geometry, this.material);
      const height = 40;
      mesh.scale.set(radius * 2, height, 1);
      mesh.position.set(x, waterY + height / 2, 2.6);
      mesh.renderOrder = 9;
      this.columns.push(mesh);
      this.root.add(mesh);
    }
  }

  update(time: number) {
    setUniform(this.material, "uTime", time);
  }

  dispose() {
    this.columns = [];
    this.material.dispose();
    this.geometry.dispose();
  }
}

export class AimGuide {
  readonly root = new Group();
  private readonly dots: ParticleField;
  private readonly reticleGeometry = new TorusGeometry(0.42, 0.05, 6, 32);
  private readonly reticleMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.4,
  });
  private readonly reticle: Mesh;
  private readonly ghostGeometry = new BoxGeometry(1, 0.3, 2.2);
  private readonly ghost: Mesh;
  private readonly ring: Mesh;

  constructor(dots: ParticleField) {
    this.dots = dots;
    this.reticle = new Mesh(this.reticleGeometry, this.reticleMaterial);
    this.ghost = new Mesh(this.ghostGeometry, this.reticleMaterial);
    this.ring = new Mesh(this.reticleGeometry, this.reticleMaterial);
    this.reticle.visible = false;
    this.ghost.visible = false;
    this.ring.visible = false;
    this.root.add(this.reticle, this.ghost, this.ring, dots.points);
  }

  update(aim: AimPreview | null, anchor: SceneTank | null, time: number) {
    this.dots.clear();
    if (!aim || !anchor) {
      this.reticle.visible = false;
      this.ghost.visible = false;
      this.ring.visible = false;
      this.dots.update(0);
      return;
    }
    const tint = aim.locked ? 0x5dff8f : 0xffffff;
    this.reticleMaterial.color.setHex(tint);
    this.reticleMaterial.emissive.setHex(tint);
    const count = aim.points.length;
    const phase = (time * 1.6) % 1;
    for (let i = 0; i < count; i++) {
      const point = aim.points[i];
      if (!point) continue;
      const fade = 1 - i / Math.max(1, count);
      this.dots.spawn({
        x: point.x,
        y: point.y,
        z: 0.6,
        life: 1,
        size: 0.26 + 0.08 * Math.max(0, 1 - Math.abs(i / count - phase) * 6),
        color: tint,
        alpha: 0.35 + fade * 0.65,
      });
    }
    this.dots.update(0);
    if (aim.target) {
      this.reticle.visible = true;
      this.reticle.position.set(aim.target.x, aim.target.y, 0.6);
      this.reticle.rotation.z = time * 1.5;
    } else {
      this.reticle.visible = false;
    }
    if (aim.wall) {
      const dx = aim.wall.x1 - aim.wall.x0;
      const dy = aim.wall.y1 - aim.wall.y0;
      this.ghost.visible = true;
      this.ghost.position.set(
        (aim.wall.x0 + aim.wall.x1) / 2,
        (aim.wall.y0 + aim.wall.y1) / 2,
        0,
      );
      this.ghost.rotation.z = Math.atan2(dy, dx);
      this.ghost.scale.set(Math.hypot(dx, dy), 0.5, 0.2);
    } else {
      this.ghost.visible = false;
    }
    if (aim.shieldRadius > 0) {
      this.ring.visible = true;
      this.ring.position.set(anchor.x, anchor.y + anchor.height / 2, 0.6);
      this.ring.scale.setScalar(aim.shieldRadius / 0.42);
    } else {
      this.ring.visible = false;
    }
  }

  dispose() {
    this.reticleGeometry.dispose();
    this.reticleMaterial.dispose();
    this.ghostGeometry.dispose();
  }
}
