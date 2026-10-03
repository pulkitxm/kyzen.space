import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Points,
  Quaternion,
  RingGeometry,
  type ShaderMaterial,
  Vector3,
} from "three";
import { particleMaterial, ringMaterial, setUniform } from "./shaders";

export type ParticleSpec = {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  color: number;
  gravity?: number;
  drag?: number;
  grow?: number;
  alpha?: number;
};

const tint = new Color();

export class ParticleField {
  readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private readonly baseAlpha: Float32Array;
  private cursor = 0;
  private live = 0;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    const geometry = new BufferGeometry();
    const attribute = (data: Float32Array, size: number) => {
      const attr = new BufferAttribute(data, size);
      attr.setUsage(DynamicDrawUsage);
      return attr;
    };
    geometry.setAttribute("position", attribute(this.positions, 3));
    geometry.setAttribute("aColor", attribute(this.colors, 3));
    geometry.setAttribute("aSize", attribute(this.sizes, 1));
    geometry.setAttribute("aAlpha", attribute(this.alphas, 1));
    this.material = particleMaterial(additive);
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 15;
  }

  setScale(scale: number) {
    setUniform(this.material, "uScale", scale);
  }

  spawn(spec: ParticleSpec) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const p = i * 3;
    this.positions[p] = spec.x;
    this.positions[p + 1] = spec.y;
    this.positions[p + 2] = spec.z ?? 0;
    this.velocity[p] = spec.vx ?? 0;
    this.velocity[p + 1] = spec.vy ?? 0;
    this.velocity[p + 2] = spec.vz ?? 0;
    tint.setHex(spec.color);
    this.colors[p] = tint.r;
    this.colors[p + 1] = tint.g;
    this.colors[p + 2] = tint.b;
    this.sizes[i] = spec.size;
    this.life[i] = spec.life;
    this.maxLife[i] = spec.life;
    this.gravity[i] = spec.gravity ?? 0;
    this.drag[i] = spec.drag ?? 0;
    this.grow[i] = spec.grow ?? 0;
    this.baseAlpha[i] = spec.alpha ?? 1;
    this.alphas[i] = spec.alpha ?? 1;
    this.live = Math.min(this.capacity, this.live + 1);
  }

  update(dt: number) {
    if (this.live === 0) return;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const remaining = this.life[i] ?? 0;
      if (remaining <= 0) continue;
      const next = remaining - dt;
      this.life[i] = next;
      if (next <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      alive += 1;
      const p = i * 3;
      const damping = Math.max(0, 1 - (this.drag[i] ?? 0) * dt);
      const vx = (this.velocity[p] ?? 0) * damping;
      const vy =
        ((this.velocity[p + 1] ?? 0) - (this.gravity[i] ?? 0) * dt) * damping;
      const vz = (this.velocity[p + 2] ?? 0) * damping;
      this.velocity[p] = vx;
      this.velocity[p + 1] = vy;
      this.velocity[p + 2] = vz;
      this.positions[p] = (this.positions[p] ?? 0) + vx * dt;
      this.positions[p + 1] = (this.positions[p + 1] ?? 0) + vy * dt;
      this.positions[p + 2] = (this.positions[p + 2] ?? 0) + vz * dt;
      this.sizes[i] = (this.sizes[i] ?? 0) + (this.grow[i] ?? 0) * dt;
      const t = next / (this.maxLife[i] ?? 1);
      this.alphas[i] = (this.baseAlpha[i] ?? 1) * Math.min(1, t * 1.6);
    }
    this.live = alive;
    const geometry = this.points.geometry;
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) {
      const attr = geometry.getAttribute(name);
      if (attr) attr.needsUpdate = true;
    }
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.live = 0;
    const alpha = this.points.geometry.getAttribute("aAlpha");
    if (alpha) alpha.needsUpdate = true;
  }
}

type Ring = {
  mesh: Mesh;
  material: ShaderMaterial;
  age: number;
  life: number;
  size: number;
};
type Flash = { light: PointLight; age: number; life: number; peak: number };
type Debris = {
  age: number;
  life: number;
  position: Vector3;
  velocity: Vector3;
  spin: Vector3;
  rotation: Vector3;
  scale: number;
};

const matrix = new Matrix4();
const quaternion = new Quaternion();
const scaleVector = new Vector3();
const euler = new Object3D();

export class Effects {
  readonly root = new Group();
  readonly sparks = new ParticleField(3200, true);
  readonly smoke = new ParticleField(1400, false);
  private readonly rings: Ring[] = [];
  private readonly flashes: Flash[] = [];
  private readonly debris: Debris[] = [];
  private readonly debrisMesh: InstancedMesh;
  private readonly ringGeometry = new RingGeometry(0.82, 1, 48);
  private readonly debrisGeometry = new BoxGeometry(0.22, 0.14, 0.18);
  private readonly debrisMaterial = new MeshStandardMaterial({
    color: 0x6d7f8e,
    metalness: 0.6,
    roughness: 0.45,
    emissive: 0x2a1406,
  });
  private ringCursor = 0;
  private flashCursor = 0;
  private debrisCursor = 0;
  shake = 0;

  constructor() {
    this.root.name = "effects";
    this.root.add(this.sparks.points, this.smoke.points);
    for (let i = 0; i < 16; i++) {
      const material = ringMaterial();
      const mesh = new Mesh(this.ringGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 18;
      this.rings.push({ mesh, material, age: 1, life: 1, size: 1 });
      this.root.add(mesh);
    }
    for (let i = 0; i < 4; i++) {
      const light = new PointLight(0xffb070, 0, 18, 2);
      this.flashes.push({ light, age: 1, life: 1, peak: 0 });
      this.root.add(light);
    }
    this.debrisMesh = new InstancedMesh(
      this.debrisGeometry,
      this.debrisMaterial,
      220,
    );
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = false;
    this.debrisMesh.count = 0;
    this.root.add(this.debrisMesh);
  }

  setPointScale(scale: number) {
    this.sparks.setScale(scale);
    this.smoke.setScale(scale);
  }

  ring(
    x: number,
    y: number,
    size: number,
    color: number,
    life = 0.45,
    z = 0.3,
  ) {
    const ring = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    if (!ring) return;
    ring.age = 0;
    ring.life = life;
    ring.size = size;
    ring.mesh.position.set(x, y, z);
    ring.mesh.visible = true;
    setUniform(ring.material, "uColor", new Color(color));
  }

  flash(x: number, y: number, peak: number, color = 0xffb070) {
    const flash = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    if (!flash) return;
    flash.age = 0;
    flash.life = 0.32;
    flash.peak = peak;
    flash.light.color.setHex(color);
    flash.light.position.set(x, y, 1.6);
  }

  burst(
    x: number,
    y: number,
    count: number,
    speed: number,
    color: number,
    options: Partial<ParticleSpec> = {},
  ) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.sparks.spawn({
        x,
        y,
        z: (Math.random() - 0.5) * 0.6,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        vz: (Math.random() - 0.5) * v * 0.5,
        life: 0.35 + Math.random() * 0.45,
        size: 0.35,
        color,
        gravity: 9,
        drag: 2.4,
        ...options,
      });
    }
  }

  explosion(x: number, y: number, radius: number, color = 0xffa040) {
    this.flash(x, y, 40 + radius * 30, color);
    this.ring(x, y, radius * 1.5, 0xcfefff, 0.5);
    this.burst(x, y, 34 + Math.round(radius * 10), radius * 7, color);
    this.burst(x, y, 14, radius * 3, 0xfff2c0, {
      size: 0.9,
      life: 0.25,
      gravity: 0,
    });
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = radius * (0.4 + Math.random() * 0.8);
      this.smoke.spawn({
        x: x + Math.cos(angle) * 0.3,
        y: y + Math.sin(angle) * 0.3,
        z: (Math.random() - 0.5) * 0.8,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v + 1.2,
        life: 0.9 + Math.random() * 0.8,
        size: 0.9 + Math.random() * 0.6,
        color: 0x2b3038,
        drag: 1.8,
        grow: 1.6,
        alpha: 0.55,
      });
    }
    this.scatter(x, y, 6 + Math.round(radius * 2), radius * 4);
    this.shake = Math.min(1.2, this.shake + radius * 0.22);
  }

  scatter(x: number, y: number, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI;
      const index = this.debrisCursor;
      this.debrisCursor = (this.debrisCursor + 1) % 220;
      const piece: Debris = {
        age: 0,
        life: 1.4 + Math.random() * 0.6,
        position: new Vector3(x, y, (Math.random() - 0.5) * 1.2),
        velocity: new Vector3(
          Math.cos(angle) * speed * (0.4 + Math.random()),
          Math.sin(angle) * speed * (0.6 + Math.random() * 0.8),
          (Math.random() - 0.5) * speed * 0.5,
        ),
        spin: new Vector3(
          Math.random() * 12,
          Math.random() * 12,
          Math.random() * 12,
        ),
        rotation: new Vector3(),
        scale: 0.6 + Math.random() * 0.9,
      };
      this.debris[index] = piece;
    }
  }

  splash(x: number, waterY: number) {
    for (let i = 0; i < 26; i++) {
      const spread = (Math.random() - 0.5) * 3;
      this.sparks.spawn({
        x: x + spread * 0.3,
        y: waterY + 0.1,
        z: (Math.random() - 0.5) * 1.5,
        vx: spread,
        vy: 6 + Math.random() * 7,
        life: 0.7 + Math.random() * 0.4,
        size: 0.32,
        color: 0x9fdcff,
        gravity: 24,
        alpha: 0.8,
      });
    }
    this.ring(x, waterY + 0.05, 2.6, 0x9fdcff, 0.8, 0.5);
  }

  dust(x: number, y: number, amount: number) {
    for (let i = 0; i < amount; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.smoke.spawn({
        x: x + dir * Math.random() * 0.8,
        y: y + 0.1,
        z: (Math.random() - 0.5) * 1.4,
        vx: dir * (1.5 + Math.random() * 2.5),
        vy: 0.6 + Math.random() * 0.8,
        life: 0.6 + Math.random() * 0.4,
        size: 0.5,
        color: 0xdcecf5,
        drag: 3,
        grow: 1.4,
        alpha: 0.5,
      });
    }
  }

  update(dt: number) {
    this.sparks.update(dt);
    this.smoke.update(dt);
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.age += dt;
      const t = ring.age / ring.life;
      if (t >= 1) {
        ring.mesh.visible = false;
        continue;
      }
      const eased = 1 - (1 - t) * (1 - t);
      ring.mesh.scale.setScalar(0.2 + ring.size * eased);
      setUniform(ring.material, "uOpacity", (1 - t) * 0.9);
    }
    for (const flash of this.flashes) {
      if (flash.age >= flash.life) {
        flash.light.intensity = 0;
        continue;
      }
      flash.age += dt;
      const t = Math.min(1, flash.age / flash.life);
      flash.light.intensity = flash.peak * (1 - t) * (1 - t);
    }
    let count = 0;
    for (const piece of this.debris) {
      if (!piece || piece.age >= piece.life) continue;
      piece.age += dt;
      piece.velocity.y -= 30 * dt;
      piece.position.addScaledVector(piece.velocity, dt);
      piece.rotation.addScaledVector(piece.spin, dt);
      const t = piece.age / piece.life;
      euler.rotation.set(piece.rotation.x, piece.rotation.y, piece.rotation.z);
      quaternion.setFromEuler(euler.rotation);
      scaleVector.setScalar(piece.scale * Math.max(0, 1 - t * t));
      matrix.compose(piece.position, quaternion, scaleVector);
      this.debrisMesh.setMatrixAt(count, matrix);
      count += 1;
    }
    this.debrisMesh.count = count;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  clear() {
    this.sparks.clear();
    this.smoke.clear();
    this.debris.length = 0;
    this.debrisMesh.count = 0;
    for (const ring of this.rings) ring.mesh.visible = false;
    for (const flash of this.flashes) flash.light.intensity = 0;
    this.shake = 0;
  }
}
