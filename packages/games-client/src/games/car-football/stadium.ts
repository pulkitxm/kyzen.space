import * as THREE from "three";

export function addStadium(scene: THREE.Scene) {
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x293746,
    roughness: 0.88,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x647586,
    metalness: 0.65,
    roughness: 0.4,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: 0x172433,
    metalness: 0.4,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xe8f2ef,
    emissive: 0xb9dfff,
    emissiveIntensity: 3,
  });
  function box(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  box(124, 0.5, 94, 0, -0.35, 0, concrete);
  const seatGeometry = new THREE.BoxGeometry(0.8, 0.5, 0.75);
  const seats = new THREE.InstancedMesh(
    seatGeometry,
    new THREE.MeshStandardMaterial({ roughness: 0.75 }),
    2688,
  );
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < 12; row++) {
      const height = 2.2 + row * 0.9;
      const offset = 30 + row * 1.2;
      box(94, 0.9, 1.4, 0, height - 0.5, side * offset, concrete);
      box(1.4, 0.9, 58, side * (45 + row * 1.2), height - 0.5, 0, concrete);
      for (let seat = 0; seat < 112; seat++) {
        const longSide = seat < 70;
        const position = longSide ? (seat - 34.5) * 1.3 : (seat - 90.5) * 1.3;
        transform.position.set(
          longSide ? position : side * (45 + row * 1.2),
          height,
          longSide ? side * offset : position,
        );
        transform.rotation.y = longSide ? 0 : Math.PI / 2;
        transform.updateMatrix();
        seats.setMatrixAt(index, transform.matrix);
        const aisle = seat % 18 === 0;
        color.setHex(
          aisle
            ? 0x89969d
            : (row + Math.floor(seat / 7)) % 4 === 0
              ? 0xe4edf0
              : side < 0
                ? 0x247aaf
                : 0xcb6538,
        );
        seats.setColorAt(index++, color);
      }
    }
    const sideRoof = box(100, 0.5, 15, 0, 16, side * 38, roof);
    sideRoof.userData.roofZ = side;
    const endRoof = box(15, 0.5, 64, side * 53, 16, 0, roof);
    endRoof.userData.roofX = side;
    for (let x = -44; x <= 44; x += 11) {
      box(0.3, 16, 0.3, x, 8, side * 44, steel);
      box(0.22, 0.3, 17, x, 15.6, side * 37, steel);
      box(5, 0.12, 0.2, x, 15.3, side * 30, white);
    }
  }
  seats.instanceMatrix.needsUpdate = true;
  scene.add(seats);
  for (const x of [-47, 47]) {
    for (const z of [-32, 32]) {
      box(0.5, 25, 0.5, x, 12.5, z, steel);
      box(7, 3, 0.4, x, 25, z, concrete);
      for (let column = 0; column < 5; column++) {
        for (let row = 0; row < 2; row++) {
          box(
            0.85,
            0.85,
            0.5,
            x + (column - 2) * 1.2,
            24.4 + row * 1.2,
            z,
            white,
          );
        }
      }
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#091b2d";
    context.fillRect(0, 0, 1024, 128);
    context.fillStyle = "#5bddff";
    context.font = "bold 44px sans-serif";
    context.textAlign = "center";
    context.fillText("KYZEN   /   TURBO PITCH", 512, 65);
    context.fillStyle = "#e9f4ff";
    context.font = "18px sans-serif";
    context.fillText("PLAY TOGETHER.   GO FULL THROTTLE.", 512, 103);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const advertising = new THREE.MeshBasicMaterial({ map: texture });
    for (const side of [-1, 1]) {
      for (const x of [-30, -10, 10, 30]) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(19.5, 2.3),
          advertising,
        );
        panel.position.set(x, 1.2, side * 27.5);
        panel.rotation.y = side > 0 ? Math.PI : 0;
        scene.add(panel);
      }
    }
  }
}
