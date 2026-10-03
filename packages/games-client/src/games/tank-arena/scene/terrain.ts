import {
  BoxGeometry,
  type BufferGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
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

function merged(parts: BufferGeometry[]) {
  if (parts.length === 0) return null;
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return result;
}

export function createTerrain(boxes: ArenaBox[]) {
  const group = new Group();
  group.name = "terrain";
  const bodies: BufferGeometry[] = [];
  const frost: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];
  const lamps: BufferGeometry[] = [];

  for (const box of boxes) {
    const depth = blockDepth(box);
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
          depth / 2 + 0.02,
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
          depth / 2 + 0.02,
          0.06,
        ),
      );
    }
    for (let x = box.x0 + 2; x < box.x1 - 1.5; x += 4) {
      if (height < 0.9) break;
      lamps.push(
        slab(
          x,
          x + 0.36,
          box.y0 + height * 0.42,
          box.y0 + height * 0.42 + 0.22,
          depth / 2 + 0.03,
          0.06,
        ),
      );
    }
  }

  const bodyMaterial = new MeshStandardMaterial({
    color: 0x7f9bb2,
    metalness: 0.62,
    roughness: 0.38,
  });
  const frostMaterial = new MeshStandardMaterial({
    color: 0xe6f6ff,
    metalness: 0.05,
    roughness: 0.85,
    emissive: 0x16303f,
  });
  const trimMaterial = new MeshStandardMaterial({
    color: 0x0c1c26,
    emissive: 0x3fe0ff,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  const lampMaterial = new MeshStandardMaterial({
    color: 0x1a1206,
    emissive: 0xffb347,
    emissiveIntensity: 2.4,
  });

  const entries: [BufferGeometry | null, MeshStandardMaterial, boolean][] = [
    [merged(bodies), bodyMaterial, true],
    [merged(frost), frostMaterial, true],
    [merged(trim), trimMaterial, false],
    [merged(lamps), lampMaterial, false],
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
