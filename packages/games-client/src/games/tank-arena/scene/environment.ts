import {
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
  type ShaderMaterial,
  Shape,
  ShapeGeometry,
} from "three";
import type { ArenaBox } from "../view";
import {
  auroraMaterial,
  portalMaterial,
  setUniform,
  waterMaterial,
} from "./shaders";

const PORTAL_WIDTH = 4.5;
const SKY_HEIGHT = 160;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridgeShape(
  width: number,
  base: number,
  peak: number,
  seed: number,
  step: number,
) {
  const random = seeded(seed);
  const shape = new Shape();
  shape.moveTo(-width / 2, base - 40);
  let x = -width / 2;
  let y = base + random() * peak;
  shape.lineTo(x, y);
  while (x < width / 2) {
    x += step * (0.5 + random());
    const target = base + random() * peak;
    y = y * 0.35 + target * 0.65;
    shape.lineTo(Math.min(x, width / 2), y);
  }
  shape.lineTo(width / 2, base - 40);
  shape.closePath();
  return shape;
}

export type Environment = {
  root: Group;
  portals: { material: ShaderMaterial; left: Mesh; right: Mesh };
  animated: ShaderMaterial[];
  sun: DirectionalLight;
  update: (time: number, dt: number) => void;
  flashPortals: () => void;
  layout: (width: number, waterY: number, boxes: ArenaBox[]) => void;
};

export function createEnvironment(scene: Scene): Environment {
  const root = new Group();
  root.name = "environment";
  scene.add(root);
  scene.fog = new Fog(0x0a2233, 70, 210);

  const hemi = new HemisphereLight(0xbfe7ff, 0x1a2a38, 1.35);
  root.add(hemi);
  const sun = new DirectionalLight(0xe8f4ff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  root.add(sun);
  root.add(sun.target);

  const aurora = auroraMaterial();
  const sky = new Mesh(new PlaneGeometry(1, 1), aurora);
  sky.name = "sky";
  sky.position.z = -95;
  sky.renderOrder = -10;
  root.add(sky);

  const mountains = new Group();
  root.add(mountains);

  const water = waterMaterial();
  const waterMesh = new Mesh(new PlaneGeometry(1, 1, 160, 24), water);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.name = "water";
  root.add(waterMesh);

  const portal = portalMaterial();
  const portalGeometry = new PlaneGeometry(PORTAL_WIDTH, 44);
  const left = new Mesh(portalGeometry, portal);
  const right = new Mesh(portalGeometry, portal);
  left.renderOrder = 5;
  right.renderOrder = 5;
  root.add(left, right);

  const decor = new Group();
  root.add(decor);

  let flash = 0;

  function clearGroup(group: Group) {
    for (const child of [...group.children]) {
      const mesh = child as Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) for (const m of material) m.dispose();
      else material?.dispose();
      group.remove(child);
    }
  }

  function layout(width: number, waterY: number, boxes: ArenaBox[]) {
    sky.scale.set(width + 520, SKY_HEIGHT, 1);
    sky.position.set(width / 2, 30, -95);

    waterMesh.scale.set(width + 260, 90, 1);
    waterMesh.position.set(width / 2, waterY, -10);

    left.position.set(0, 14, 0.4);
    right.position.set(width, 14, 0.4);

    clearGroup(mountains);
    const layers = [
      { z: -78, base: -4, peak: 34, color: 0x0d2a40, step: 9, seed: 11 },
      { z: -58, base: -6, peak: 24, color: 0x123a52, step: 7, seed: 23 },
      { z: -40, base: -8, peak: 15, color: 0x1a4a62, step: 5, seed: 37 },
    ];
    for (const layer of layers) {
      const shape = ridgeShape(
        width + 360,
        layer.base,
        layer.peak,
        layer.seed,
        layer.step,
      );
      const mesh = new Mesh(
        new ShapeGeometry(shape),
        new MeshBasicMaterial({ color: layer.color, fog: true }),
      );
      mesh.position.set(width / 2, 0, layer.z);
      mountains.add(mesh);
    }

    clearGroup(decor);
    const pillarMaterial = new MeshStandardMaterial({
      color: 0x6f8fa6,
      roughness: 0.4,
      metalness: 0.55,
    });
    const pillarGeometry = new CylinderGeometry(0.55, 0.75, 1, 10);
    const random = seeded(Math.round(width));
    for (const box of boxes) {
      if (box.y1 > 0.01 || box.y0 > -2) continue;
      const span = box.x1 - box.x0;
      const count = Math.max(1, Math.round(span / 7));
      for (let i = 0; i < count; i++) {
        const x = box.x0 + ((i + 0.5) * span) / count;
        const height = box.y0 - (waterY - 2.5);
        for (const z of [-2.1, 2.1]) {
          const pillar = new Mesh(pillarGeometry, pillarMaterial);
          pillar.scale.set(1, height, 1);
          pillar.position.set(x, box.y0 - height / 2, z);
          pillar.receiveShadow = true;
          decor.add(pillar);
        }
      }
    }
    const shardMaterial = new MeshStandardMaterial({
      color: 0x9fd9ff,
      roughness: 0.15,
      metalness: 0.1,
      emissive: 0x0b3550,
      transparent: true,
      opacity: 0.85,
    });
    const shardGeometry = new CylinderGeometry(0, 1, 1, 5);
    for (let x = -60; x < width + 60; x += 6 + random() * 9) {
      const shard = new Mesh(shardGeometry, shardMaterial);
      const h = 4 + random() * 11;
      shard.scale.set(0.8 + random() * 1.4, h, 0.8 + random() * 1.2);
      shard.position.set(x, waterY + h / 2 - 1, -28 - random() * 16);
      shard.rotation.z = (random() - 0.5) * 0.25;
      decor.add(shard);
    }
  }

  function update(time: number, dt: number) {
    setUniform(aurora, "uTime", time);
    setUniform(water, "uTime", time);
    setUniform(portal, "uTime", time);
    flash = Math.max(0, flash - dt * 2.2);
    setUniform(portal, "uFlash", flash);
  }

  return {
    root,
    portals: { material: portal, left, right },
    animated: [aurora, water, portal],
    sun,
    update,
    flashPortals: () => {
      flash = 1;
    },
    layout,
  };
}
