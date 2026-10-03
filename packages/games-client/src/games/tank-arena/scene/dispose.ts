import type { BufferGeometry, Material, Object3D, Texture } from "three";

type Disposable = { dispose: () => void };

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { isTexture?: boolean }).isTexture === true
  );
}

function materialTextures(material: Material): Texture[] {
  const found: Texture[] = [];
  for (const value of Object.values(material)) {
    if (isTexture(value)) found.push(value);
  }
  const uniforms = (
    material as { uniforms?: Record<string, { value: unknown }> }
  ).uniforms;
  if (uniforms) {
    for (const uniform of Object.values(uniforms)) {
      if (isTexture(uniform.value)) found.push(uniform.value);
    }
  }
  return found;
}

export function collectResources(root: Object3D): Set<Disposable> {
  const resources = new Set<Disposable>();
  root.traverse((object) => {
    const withGeometry = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (withGeometry.geometry) resources.add(withGeometry.geometry);
    const materials = Array.isArray(withGeometry.material)
      ? withGeometry.material
      : withGeometry.material
        ? [withGeometry.material]
        : [];
    for (const material of materials) {
      resources.add(material);
      for (const texture of materialTextures(material)) resources.add(texture);
    }
    const instanced = object as Object3D & { dispose?: () => void };
    if (
      (object as { isInstancedMesh?: boolean }).isInstancedMesh &&
      instanced.dispose
    ) {
      resources.add({ dispose: () => instanced.dispose?.() });
    }
  });
  return resources;
}

export function disposeTree(root: Object3D, extra: Iterable<Disposable> = []) {
  const resources = collectResources(root);
  for (const item of extra) resources.add(item);
  for (const resource of resources) resource.dispose();
  root.clear();
}
