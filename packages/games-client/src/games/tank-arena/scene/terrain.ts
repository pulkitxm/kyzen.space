import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ArenaBox } from "../view";

const BEVEL = 0.16;

function blockDepth(box: ArenaBox) {
  return box.y1 <= 0.01 ? 7 : 4.4;
}

function roundedRect(x0: number, y0: number, x1: number, y1: number) {
  const r = Math.min(0.22, (x1 - x0) / 4, (y1 - y0) / 4);
  const shape = new Shape();
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r);
  shape.quadraticCurveTo(x1, y1, x1 - r, y1);
  shape.lineTo(x0 + r, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  return shape;
}

function blockGeometry(box: ArenaBox) {
  const depth = blockDepth(box);
  const geometry = new ExtrudeGeometry(
    roundedRect(box.x0 + BEVEL, box.y0 + BEVEL, box.x1 - BEVEL, box.y1 - BEVEL),
    {
      depth: depth - BEVEL * 2,
      bevelEnabled: true,
      bevelSize: BEVEL,
      bevelThickness: BEVEL,
      bevelSegments: 2,
      curveSegments: 3,
    },
  );
  geometry.translate(0, 0, -depth / 2 + BEVEL);
  return geometry;
}

function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  depth: number,
) {
  const geometry = new BoxGeometry(x1 - x0, y1 - y0, depth).toNonIndexed();
  geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return geometry;
}

function rivet(x: number, y: number, z: number) {
  const geometry = new CylinderGeometry(0.06, 0.06, 0.08, 6);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, z);
  return geometry;
}

function pipe(x0: number, x1: number, y: number, z: number, radius = 0.12) {
  const geometry = new CylinderGeometry(radius, radius, x1 - x0, 8);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate((x0 + x1) / 2, y, z);
  return geometry;
}

function pipeJoint(x: number, y: number, z: number, radius = 0.16) {
  const geometry = new SphereGeometry(radius, 8, 6);
  geometry.translate(x, y, z);
  return geometry;
}

function pipeElbow(x: number, y: number, z: number, radius = 0.12) {
  const geometry = new TorusGeometry(0.25, radius, 6, 8, Math.PI / 2);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, z);
  return geometry;
}

function warningStripe(x0: number, x1: number, y: number, z: number) {
  const geometry = new BoxGeometry(x1 - x0, 0.16, 0.04).toNonIndexed();
  geometry.translate((x0 + x1) / 2, y, z);
  return geometry;
}

function crate(x: number, y: number, z: number, size = 0.8) {
  const geometry = new BoxGeometry(size, size, size).toNonIndexed();
  geometry.translate(x, y + size / 2, z);
  return geometry;
}

function barrel(x: number, y: number, z: number) {
  const geometry = new CylinderGeometry(0.35, 0.38, 0.9, 12);
  geometry.translate(x, y + 0.45, z);
  return geometry;
}

function lamp(x: number, y: number, z: number) {
  const geometry = new BoxGeometry(0.14, 0.2, 0.4).toNonIndexed();
  geometry.translate(x, y, z);
  return geometry;
}

function ventGrate(x: number, y: number, z: number) {
  const geometry = new BoxGeometry(0.8, 0.5, 0.06).toNonIndexed();
  geometry.translate(x, y, z);
  return geometry;
}

function merged(parts: BufferGeometry[]) {
  if (parts.length === 0) return null;
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return result;
}

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

export function createTerrain(boxes: ArenaBox[]) {
  const group = new Group();
  group.name = "terrain";
  const bodies: BufferGeometry[] = [];
  const frost: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];
  const lamps: BufferGeometry[] = [];
  const rivets: BufferGeometry[] = [];
  const pipes: BufferGeometry[] = [];
  const stripes: BufferGeometry[] = [];
  const props: BufferGeometry[] = [];
  const vents: BufferGeometry[] = [];

  const random = seeded(42);

  for (const box of boxes) {
    const depth = blockDepth(box);
    const frontZ = depth / 2 + 0.02;
    bodies.push(blockGeometry(box));
    frost.push(
      slab(
        box.x0 - 0.04,
        box.x1 + 0.04,
        box.y1 - 0.02,
        box.y1 + 0.14,
        0,
        depth + 0.1,
      ),
    );
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;

    if (width > 1.2) {
      trim.push(
        slab(
          box.x0 + 0.3,
          box.x1 - 0.3,
          box.y1 - 0.34,
          box.y1 - 0.24,
          frontZ,
          0.06,
        ),
      );
    }

    if (height > 1.6) {
      trim.push(
        slab(
          box.x0 + 0.18,
          box.x0 + 0.26,
          box.y0 + 0.3,
          box.y1 - 0.5,
          frontZ,
          0.06,
        ),
      );
    }

    for (let x = box.x0 + 2; x < box.x1 - 1.5; x += 4) {
      if (height < 0.9) break;
      lamps.push(lamp(x + 0.18, box.y0 + height * 0.42 + 0.1, frontZ + 0.02));
    }

    const rivetSpacing = 2.2;
    for (let x = box.x0 + 0.4; x < box.x1 - 0.3; x += rivetSpacing) {
      rivets.push(rivet(x, box.y1 - 0.25, frontZ));
      if (height > 2) {
        rivets.push(rivet(x, box.y0 + 0.3, frontZ));
      }
    }
    for (let y = box.y0 + 0.6; y < box.y1 - 0.4; y += rivetSpacing) {
      rivets.push(rivet(box.x0 + 0.25, y, frontZ));
      rivets.push(rivet(box.x1 - 0.25, y, frontZ));
    }

    if (width > 4 && height > 1.5) {
      const pipeY = box.y0 + height * 0.65;
      pipes.push(pipe(box.x0 + 0.5, box.x1 - 0.5, pipeY, frontZ + 0.06));
      pipes.push(pipeJoint(box.x0 + 0.5, pipeY, frontZ + 0.06));
      pipes.push(pipeJoint(box.x1 - 0.5, pipeY, frontZ + 0.06));
    }

    if (width > 3 && box.y0 < 0.1) {
      const stripeY = box.y1 - 0.5;
      stripes.push(
        warningStripe(box.x0 + 0.2, box.x0 + 1.4, stripeY, frontZ + 0.01),
      );
      stripes.push(
        warningStripe(box.x1 - 1.4, box.x1 - 0.2, stripeY, frontZ + 0.01),
      );
    }

    if (width > 5 && height > 2 && random() > 0.5) {
      vents.push(
        ventGrate(box.x0 + width * 0.3, box.y0 + height * 0.35, frontZ + 0.01),
      );
    }
  }

  for (const box of boxes) {
    if (box.y1 > 0.1) continue;
    const depth = blockDepth(box);
    const frontZ = depth / 2 + 0.02;
    const width = box.x1 - box.x0;

    if (width > 6) {
      const crateX = box.x0 + width * 0.15 + random() * 2;
      if (random() > 0.4) {
        props.push(crate(crateX, box.y1, frontZ - 0.5, 0.7 + random() * 0.3));
      }
      if (random() > 0.6) {
        const barrelX = box.x1 - width * 0.15 - random() * 2;
        props.push(barrel(barrelX, box.y1, frontZ - 0.4));
      }
    }

    if (width > 8 && random() > 0.5) {
      const pipeY = box.y1 + 0.6;
      pipes.push(pipeElbow(box.x0 + 1, pipeY, frontZ));
    }
  }

  const bodyMaterial = new MeshStandardMaterial({
    color: 0x6a8399,
    metalness: 0.65,
    roughness: 0.35,
  });
  const frostMaterial = new MeshStandardMaterial({
    color: 0xe8f8ff,
    metalness: 0.08,
    roughness: 0.82,
    emissive: 0x1a3848,
    emissiveIntensity: 0.4,
  });
  const trimMaterial = new MeshStandardMaterial({
    color: 0x0a1820,
    emissive: 0x4af0ff,
    emissiveIntensity: 2.8,
    roughness: 0.25,
  });
  const lampMaterial = new MeshStandardMaterial({
    color: 0x1a1206,
    emissive: 0xffb040,
    emissiveIntensity: 3.0,
  });
  const rivetMaterial = new MeshStandardMaterial({
    color: 0x4a5a68,
    metalness: 0.8,
    roughness: 0.3,
  });
  const pipeMaterial = new MeshStandardMaterial({
    color: 0x5a707e,
    metalness: 0.7,
    roughness: 0.35,
    emissive: 0x102030,
    emissiveIntensity: 0.3,
  });
  const stripeMaterial = new MeshStandardMaterial({
    color: 0xf5c020,
    emissive: 0x8a6010,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  });
  const propMaterial = new MeshStandardMaterial({
    color: 0x5a6872,
    metalness: 0.5,
    roughness: 0.55,
  });
  const ventMaterial = new MeshStandardMaterial({
    color: 0x3a4550,
    metalness: 0.6,
    roughness: 0.4,
    emissive: 0x102838,
    emissiveIntensity: 0.6,
  });

  const entries: [BufferGeometry | null, MeshStandardMaterial, boolean][] = [
    [merged(bodies), bodyMaterial, true],
    [merged(frost), frostMaterial, true],
    [merged(trim), trimMaterial, false],
    [merged(lamps), lampMaterial, false],
    [merged(rivets), rivetMaterial, false],
    [merged(pipes), pipeMaterial, false],
    [merged(stripes), stripeMaterial, false],
    [merged(props), propMaterial, true],
    [merged(vents), ventMaterial, false],
  ];
  for (const [geometry, material, shadows] of entries) {
    if (!geometry) {
      material.dispose();
      continue;
    }
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
  }
  return group;
}
