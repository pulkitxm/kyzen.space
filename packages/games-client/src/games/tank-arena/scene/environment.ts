import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
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
  snowfallMaterial,
  waterMaterial,
} from "./shaders";

const PORTAL_WIDTH = 5.0;
const SKY_HEIGHT = 160;
const SNOW_COUNT = 800;

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

function createSnowfall(width: number) {
  const positions = new Float32Array(SNOW_COUNT * 3);
  const velocities = new Float32Array(SNOW_COUNT * 3);
  const sizes = new Float32Array(SNOW_COUNT);
  const random = seeded(7);
  for (let i = 0; i < SNOW_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (random() - 0.5) * width * 1.5;
    positions[i3 + 1] = random() * 50 - 5;
    positions[i3 + 2] = (random() - 0.5) * 40;
    velocities[i3] = (random() - 0.5) * 0.8;
    velocities[i3 + 1] = -(1.5 + random() * 2.5);
    velocities[i3 + 2] = (random() - 0.5) * 0.3;
    sizes[i] = 0.08 + random() * 0.12;
  }
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  posAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  return { geometry, positions, velocities, sizes };
}

type Snowfall = {
  points: Points;
  positions: Float32Array;
  velocities: Float32Array;
  width: number;
  minY: number;
};

export type Environment = {
  root: Group;
  portals: { material: ShaderMaterial; left: Mesh; right: Mesh };
  animated: ShaderMaterial[];
  sun: DirectionalLight;
  update: (time: number, dt: number) => void;
  flashPortals: () => void;
  layout: (width: number, waterY: number, boxes: ArenaBox[]) => void;
};

function createDistantStructures(width: number, random: () => number) {
  const group = new Group();
  const towerMaterial = new MeshBasicMaterial({ color: 0x0a1820, fog: true });
  const windowMaterial = new MeshBasicMaterial({ color: 0x1a4a5a, fog: true });
  const pipeMaterial = new MeshBasicMaterial({ color: 0x0d2030, fog: true });

  for (let x = -100; x < width + 100; x += 35 + random() * 25) {
    const z = -70 - random() * 20;
    const h = 15 + random() * 35;
    const w = 3 + random() * 6;

    const tower = new Mesh(new BoxGeometry(w, h, w * 0.8), towerMaterial);
    tower.position.set(x, h / 2 - 10, z);
    group.add(tower);

    for (let wy = 2; wy < h - 2; wy += 3 + random() * 2) {
      const windowGeo = new BoxGeometry(w * 0.6, 1.2, 0.1);
      const windowMesh = new Mesh(windowGeo, windowMaterial);
      windowMesh.position.set(x, wy - 5, z + w * 0.41);
      group.add(windowMesh);
    }

    if (random() > 0.5) {
      const pipeGeo = new CylinderGeometry(0.5, 0.5, h * 0.7, 6);
      const pipeMesh = new Mesh(pipeGeo, pipeMaterial);
      pipeMesh.position.set(x + w * 0.6, h * 0.35 - 10, z);
      group.add(pipeMesh);
    }

    if (random() > 0.6) {
      const antennaGeo = new CylinderGeometry(0.15, 0.15, 8, 4);
      const antenna = new Mesh(antennaGeo, pipeMaterial);
      antenna.position.set(x, h - 6, z);
      group.add(antenna);
    }
  }

  return group;
}

export function createEnvironment(scene: Scene): Environment {
  const root = new Group();
  root.name = "environment";
  scene.add(root);
  scene.fog = new Fog(0x081828, 60, 180);

  const hemi = new HemisphereLight(0xc0e8ff, 0x182838, 1.5);
  root.add(hemi);
  const sun = new DirectionalLight(0xe4f0ff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  root.add(sun);
  root.add(sun.target);

  const rim = new DirectionalLight(0x4080ff, 0.8);
  rim.position.set(-20, 10, -30);
  root.add(rim);

  const aurora = auroraMaterial();
  const sky = new Mesh(new PlaneGeometry(1, 1), aurora);
  sky.name = "sky";
  sky.position.z = -95;
  sky.renderOrder = -10;
  root.add(sky);

  const mountains = new Group();
  root.add(mountains);

  const structures = new Group();
  structures.name = "structures";
  root.add(structures);

  const water = waterMaterial();
  const waterMesh = new Mesh(new PlaneGeometry(1, 1, 160, 24), water);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.name = "water";
  root.add(waterMesh);

  const portal = portalMaterial();
  const portalGeometry = new PlaneGeometry(PORTAL_WIDTH, 48);
  const left = new Mesh(portalGeometry, portal);
  const right = new Mesh(portalGeometry, portal);
  left.renderOrder = 5;
  right.renderOrder = 5;
  root.add(left, right);

  const decor = new Group();
  root.add(decor);

  let snowfall: Snowfall | null = null;
  const snowMaterial = snowfallMaterial();
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

    left.position.set(-0.5, 16, 0.5);
    right.position.set(width + 0.5, 16, 0.5);

    clearGroup(mountains);
    const layers = [
      { z: -85, base: -6, peak: 40, color: 0x081828, step: 10, seed: 11 },
      { z: -65, base: -8, peak: 28, color: 0x0c2438, step: 7, seed: 23 },
      { z: -48, base: -10, peak: 18, color: 0x123850, step: 5, seed: 37 },
    ];
    for (const layer of layers) {
      const shape = ridgeShape(
        width + 400,
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

    clearGroup(structures);
    const structRandom = seeded(Math.round(width) + 100);
    const distantGroup = createDistantStructures(width, structRandom);
    structures.add(distantGroup);

    clearGroup(decor);
    const pillarMaterial = new MeshStandardMaterial({
      color: 0x5a7a90,
      roughness: 0.35,
      metalness: 0.6,
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
      color: 0xa0e0ff,
      roughness: 0.12,
      metalness: 0.15,
      emissive: 0x104060,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.88,
    });
    const shardGeometry = new CylinderGeometry(0, 1, 1, 5);
    for (let x = -60; x < width + 60; x += 5 + random() * 8) {
      const shard = new Mesh(shardGeometry, shardMaterial);
      const h = 5 + random() * 14;
      shard.scale.set(0.7 + random() * 1.2, h, 0.7 + random() * 1.0);
      shard.position.set(x, waterY + h / 2 - 1.5, -26 - random() * 14);
      shard.rotation.z = (random() - 0.5) * 0.3;
      decor.add(shard);
    }

    if (snowfall) {
      root.remove(snowfall.points);
      snowfall.points.geometry.dispose();
    }
    const snow = createSnowfall(width);
    const snowPoints = new Points(snow.geometry, snowMaterial);
    snowPoints.position.set(width / 2, 0, 0);
    snowPoints.frustumCulled = false;
    snowPoints.renderOrder = 25;
    root.add(snowPoints);
    snowfall = {
      points: snowPoints,
      positions: snow.positions,
      velocities: snow.velocities,
      width,
      minY: waterY - 5,
    };
  }

  function update(time: number, dt: number) {
    setUniform(aurora, "uTime", time);
    setUniform(water, "uTime", time);
    setUniform(portal, "uTime", time);
    setUniform(snowMaterial, "uTime", time);
    flash = Math.max(0, flash - dt * 2.2);
    setUniform(portal, "uFlash", flash);

    if (snowfall) {
      const { positions, velocities, width, minY } = snowfall;
      const maxY = 50;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const i3 = i * 3;
        const px = positions[i3] ?? 0;
        const py = positions[i3 + 1] ?? 0;
        const pz = positions[i3 + 2] ?? 0;
        const vx = velocities[i3] ?? 0;
        const vy = velocities[i3 + 1] ?? 0;
        const vz = velocities[i3 + 2] ?? 0;
        positions[i3] = px + vx * dt;
        positions[i3 + 1] = py + vy * dt;
        positions[i3 + 2] = pz + vz * dt;

        if ((positions[i3 + 1] ?? 0) < minY) {
          positions[i3 + 1] = maxY;
          positions[i3] = (Math.random() - 0.5) * width * 1.5;
        }
      }
      const posAttr = snowfall.points.geometry.getAttribute("position");
      if (posAttr) posAttr.needsUpdate = true;
    }
  }

  return {
    root,
    portals: { material: portal, left, right },
    animated: [aurora, water, portal, snowMaterial],
    sun,
    update,
    flashPortals: () => {
      flash = 1;
    },
    layout,
  };
}
