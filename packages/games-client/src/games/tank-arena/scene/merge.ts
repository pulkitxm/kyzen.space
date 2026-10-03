import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function nonIndexed(geometry: BufferGeometry) {
  if (!geometry.index) return geometry;
  const result = geometry.toNonIndexed();
  geometry.dispose();
  return result;
}

export function mergeNonIndexed(parts: BufferGeometry[]) {
  const ready = parts.map(nonIndexed);
  const result = mergeGeometries(ready, false);
  for (const part of ready) part.dispose();
  if (!result) throw new Error("geometry merge failed");
  return result;
}
