import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from "three";
import {
  actionFocus,
  CAMERA_FOV,
  CAMERA_LIFT,
  damp,
  frameCamera,
  needsMinimap,
} from "../camera";
import type {
  AimPreview,
  ArenaHandle,
  ArenaLayout,
  ArenaMountOptions,
  CameraFocus,
  PreviewHandle,
  SceneEvent,
  SceneFrame,
  SceneTank,
  TankModelKind,
} from "../view";
import { disposeTree } from "./dispose";
import { Effects, ParticleField } from "./effects";
import { createEnvironment } from "./environment";
import { drawMinimap, OverlayLayer } from "./overlay";
import {
  AimGuide,
  AirstrikeColumns,
  Mines,
  PICKUP_COLORS,
  Pickups,
  Projectiles,
  Shields,
  Walls,
} from "./props";
import { browserDeps, type SceneDeps } from "./renderer";
import { createTankKit, MODEL_SIZE, TankModel } from "./tanks";
import { createTerrain } from "./terrain";

const EMPTY_FRAME: SceneFrame = {
  tanks: [],
  projectiles: [],
  walls: [],
  pickups: [],
  mines: [],
};

const AIRSTRIKE_RADIUS = 2.6;
const ACTION_CEILING = 12;

export type ArenaInternals = ArenaHandle & { scene: Scene };

export function mountArena(
  container: HTMLElement,
  options: ArenaMountOptions,
  deps: SceneDeps = browserDeps,
): ArenaInternals | null {
  let renderer: ReturnType<SceneDeps["createRenderer"]>;
  try {
    renderer = deps.createRenderer({ shadows: true, alpha: false });
  } catch {
    return null;
  }
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color(0x020812);
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.5, 420);
  const environment = createEnvironment(scene);
  const kit = createTankKit();
  const effects = new Effects();
  const projectiles = new Projectiles();
  const shields = new Shields();
  const walls = new Walls();
  const mines = new Mines();
  const pickups = new Pickups();
  const columns = new AirstrikeColumns();
  const aimDots = new ParticleField(160, true);
  const aimGuide = new AimGuide(aimDots);
  const overlay = new OverlayLayer(options.overlay);
  const tankRoot = new Group();
  tankRoot.name = "tanks";
  scene.add(
    tankRoot,
    effects.root,
    projectiles.root,
    shields.root,
    walls.root,
    mines.root,
    pickups.root,
    columns.root,
    aimGuide.root,
  );
  let terrain: Group | null = null;
  const composer = deps.createComposer(renderer, scene, camera);

  let layout: ArenaLayout = { width: 64, waterY: -6, boxes: [] };
  let frame: SceneFrame = EMPTY_FRAME;
  let tankIndex = new Map<string, SceneTank>();
  const models = new Map<string, TankModel>();
  const modelKeys = new Map<string, string>();
  let aim: AimPreview | null = null;
  let focus: CameraFocus = { mode: "overview" };
  let reducedMotion = options.reducedMotion;
  let insets = { top: 0, bottom: 0 };
  let ticker: ((dtMs: number) => void) | null = null;
  let width = 1;
  let height = 1;
  let disposed = false;
  let paused = false;
  let minimapShown = false;
  let frameHandle = 0;
  let last = deps.now();
  let time = 0;
  const cameraState = { x: 32, y: 6, distance: 60, vx: 0, ready: false };
  let lastFocus = { x: 32, y: 2 };
  const projected = new Vector3();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const ground = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  const muzzle = { x: 0, y: 0 };

  function resize() {
    const nextWidth = Math.max(1, container.clientWidth);
    const nextHeight = Math.max(1, container.clientHeight);
    const ratio = deps.pixelRatio();
    width = nextWidth;
    height = nextHeight;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const scale =
      (height * ratio) / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
    effects.setPointScale(scale);
    aimDots.setScale(scale);
  }

  function onContextLost(event: Event) {
    event.preventDefault();
    paused = true;
    deps.cancelFrame(frameHandle);
    options.onContextLost();
  }
  function onContextRestored() {
    options.onContextRestored();
  }
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  const resizeObserver = deps.observeResize(container, resize);
  resize();

  function syncModels() {
    const detailed = frame.tanks.length <= 12;
    const shadows = frame.tanks.length <= 16;
    const seen = new Set<string>();
    for (const tank of frame.tanks) {
      if (!tank.kind) continue;
      seen.add(tank.role);
      const key = `${tank.kind}:${tank.color}:${detailed}`;
      let model = models.get(tank.role);
      if (!model || modelKeys.get(tank.role) !== key) {
        if (model) {
          tankRoot.remove(model.root);
          model.dispose();
        }
        model = new TankModel(kit, tank.kind, tank.color, detailed);
        model.root.traverse((object) => {
          if ((object as Mesh).isMesh && !shadows && !tank.local) {
            object.castShadow = false;
          }
        });
        models.set(tank.role, model);
        modelKeys.set(tank.role, key);
        tankRoot.add(model.root);
      }
    }
    for (const [role, model] of models) {
      if (seen.has(role)) continue;
      tankRoot.remove(model.root);
      model.dispose();
      models.delete(role);
      modelKeys.delete(role);
    }
  }

  function tankAt(role: string) {
    return tankIndex.get(role) ?? null;
  }

  function project(x: number, y: number) {
    projected.set(x, y, 0).project(camera);
    if (projected.z > 1) return null;
    return {
      x: ((projected.x + 1) / 2) * width,
      y: ((1 - projected.y) / 2) * height,
    };
  }

  function handleEvent(event: SceneEvent) {
    switch (event.type) {
      case "fire": {
        const model = models.get(event.role);
        model?.fire();
        const origin = model
          ? model.muzzleWorld(muzzle)
          : { x: event.x, y: event.y };
        effects.burst(origin.x, origin.y, 14, 6, 0xffd38a, {
          gravity: 0,
          life: 0.22,
          size: 0.5,
        });
        effects.flash(origin.x, origin.y, 18, 0xffd38a);
        break;
      }
      case "explode":
        effects.explosion(event.x, event.y, event.radius);
        break;
      case "mine":
        effects.explosion(event.x, event.y, 2.6, 0xff4a4a);
        break;
      case "damage": {
        const tank = tankAt(event.role);
        if (tank) overlay.damage(tank, event.amount, event.color);
        break;
      }
      case "jump":
        effects.dust(event.x, event.y, 10);
        break;
      case "leap":
        models.get(event.role)?.boost();
        effects.burst(event.x, event.y + 0.3, 24, 7, 0x7fd8ff, {
          gravity: -2,
          size: 0.5,
        });
        effects.dust(event.x, event.y, 14);
        break;
      case "land":
        models.get(event.role)?.land();
        effects.dust(event.x, event.y, 8);
        break;
      case "shield": {
        const tank = tankAt(event.role);
        if (tank)
          effects.ring(
            tank.x,
            tank.y + tank.height / 2,
            tank.halfWidth + 1.2,
            0x9fe8ff,
            0.5,
          );
        break;
      }
      case "wall":
        effects.burst(event.x, event.y, 22, 5, 0xa8d8ff, {
          gravity: 0,
          size: 0.4,
        });
        break;
      case "split":
        effects.burst(event.x, event.y, 30, 6, 0xfff1a8, {
          gravity: 0,
          size: 0.45,
          life: 0.5,
        });
        effects.ring(event.x, event.y, 1.4, 0xfff1a8, 0.35);
        break;
      case "pickup":
        effects.burst(event.x, event.y, 26, 5, PICKUP_COLORS[event.kind], {
          gravity: -3,
          size: 0.45,
        });
        effects.ring(event.x, event.y, 2, PICKUP_COLORS[event.kind], 0.5);
        break;
      case "portal":
        environment.flashPortals();
        effects.ring(0, event.y, 1.8, 0x5dff9a, 0.45);
        effects.ring(layout.width, event.y, 1.8, 0x5dff9a, 0.45);
        break;
      case "splash":
        effects.splash(event.x, layout.waterY);
        break;
      case "eliminate":
        effects.explosion(event.x, event.y + 0.6, 3.4, 0xff7a3a);
        effects.scatter(event.x, event.y + 0.6, 18, 9);
        break;
    }
  }

  function updateCamera(dt: number) {
    const aspect = width / height;
    let target = lastFocus;
    if (focus.mode === "tank") {
      const tank = tankAt(focus.role);
      if (tank?.alive) target = { x: tank.x, y: tank.y + tank.height / 2 };
    } else if (focus.mode === "action") {
      const action = actionFocus(frame, layout.width, lastFocus);
      target = { x: action.x, y: Math.min(action.y, ACTION_CEILING) };
    } else {
      target = { x: layout.width / 2, y: 2 };
    }
    lastFocus = target;
    const framing = frameCamera({
      focusX: target.x,
      focusY: target.y,
      worldWidth: layout.width,
      waterY: layout.waterY,
      aspect,
      insetTop: insets.top / height,
      insetBottom: insets.bottom / height,
    });
    if (!cameraState.ready) {
      cameraState.x = framing.x;
      cameraState.y = framing.y;
      cameraState.distance = framing.distance;
      cameraState.ready = true;
    }
    const previousX = cameraState.x;
    const lambda = focus.mode === "action" ? 3.2 : 4.5;
    cameraState.x = damp(cameraState.x, framing.x, lambda, dt);
    cameraState.y = damp(cameraState.y, framing.y, lambda, dt);
    cameraState.distance = damp(cameraState.distance, framing.distance, 3, dt);
    const pan = dt > 0 ? (cameraState.x - previousX) / dt : 0;
    cameraState.vx = damp(cameraState.vx, pan, 4, dt);
    const sway = Math.max(-2.4, Math.min(2.4, cameraState.vx * 0.12));
    const shake = reducedMotion ? 0 : effects.shake;
    const jitterX = shake > 0 ? (Math.random() - 0.5) * shake * 0.7 : 0;
    const jitterY = shake > 0 ? (Math.random() - 0.5) * shake * 0.7 : 0;
    camera.position.set(
      cameraState.x - sway + jitterX,
      cameraState.y + CAMERA_LIFT + jitterY,
      cameraState.distance,
    );
    camera.lookAt(
      cameraState.x + jitterX * 0.5,
      cameraState.y + jitterY * 0.5,
      0,
    );

    const sun = environment.sun;
    sun.position.set(cameraState.x - 14, cameraState.y + 34, 26);
    sun.target.position.set(cameraState.x, cameraState.y - 2, 0);
    const shadowCamera = sun.shadow.camera;
    const halfW = framing.visibleWidth / 2 + 6;
    const halfH = framing.visibleHeight / 2 + 8;
    if (shadowCamera.right !== halfW || shadowCamera.top !== halfH) {
      shadowCamera.left = -halfW;
      shadowCamera.right = halfW;
      shadowCamera.top = halfH;
      shadowCamera.bottom = -halfH;
      shadowCamera.near = 1;
      shadowCamera.far = 120;
      shadowCamera.updateProjectionMatrix();
    }
    return framing;
  }

  function tick() {
    if (disposed || paused) return;
    const now = deps.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    ticker?.(dt * 1000);
    environment.update(time, dt);
    columns.update(time);
    const scale = (tank: SceneTank) =>
      tank.kind ? tank.height / MODEL_SIZE[tank.kind].height : 1;
    for (const tank of frame.tanks) {
      const model = models.get(tank.role);
      if (!model) continue;
      model.setVisible(tank.alive);
      if (!tank.alive) continue;
      model.update(tank, dt, time, scale(tank));
      if (tank.hp / Math.max(1, tank.maxHp) < 0.3 && Math.random() < dt * 14) {
        effects.smoke.spawn({
          x: tank.x + (Math.random() - 0.5) * tank.halfWidth,
          y: tank.y + tank.height,
          z: (Math.random() - 0.5) * 0.6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1.4 + Math.random(),
          life: 1.4,
          size: 0.45,
          color: 0x2a2d33,
          grow: 1.1,
          alpha: 0.6,
        });
      }
    }
    projectiles.update(frame.projectiles, effects.sparks, dt);
    shields.update(frame.tanks, dt, time);
    walls.update(frame.walls, time);
    mines.update(frame.mines, time);
    pickups.update(frame.pickups, time);
    aimGuide.update(aim, aim ? tankAt(aim.role) : null, time);
    effects.update(dt);
    const framing = updateCamera(dt);
    composer.render(dt);
    overlay.place(frame.tanks, project, time);
    overlay.update(dt, tankIndex, project);
    if (options.minimap) {
      const show = needsMinimap(layout.width, width / height);
      if (show !== minimapShown) {
        minimapShown = show;
        options.minimap.style.visibility = show ? "visible" : "hidden";
      }
      if (show) {
        drawMinimap(options.minimap, layout, frame, {
          x0: cameraState.x - framing.visibleWidth / 2,
          x1: cameraState.x + framing.visibleWidth / 2,
        });
      }
    }
    frameHandle = deps.requestFrame(tick);
  }
  frameHandle = deps.requestFrame(tick);

  return {
    scene,
    setLayout: (next) => {
      layout = next;
      if (terrain) {
        scene.remove(terrain);
        disposeTree(terrain);
      }
      terrain = createTerrain(next.boxes);
      scene.add(terrain);
      environment.layout(next.width, next.waterY, next.boxes);
      cameraState.ready = false;
    },
    setFrame: (next) => {
      frame = next;
      tankIndex = new Map(next.tanks.map((tank) => [tank.role, tank]));
      syncModels();
    },
    emit: (events) => {
      for (const event of events) handleEvent(event);
    },
    setAim: (next) => {
      aim = next;
    },
    setAirstrike: (next) => columns.set(next, layout.waterY, AIRSTRIKE_RADIUS),
    setFocus: (next) => {
      focus = next;
    },
    setReducedMotion: (next) => {
      reducedMotion = next;
    },
    setInsets: (next) => {
      insets = next;
    },
    setTicker: (next) => {
      ticker = next;
    },
    screenToWorld: (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray.intersectPlane(ground, hit)
        ? { x: hit.x, y: hit.y }
        : null;
    },
    worldToScreen: (x, y) => project(x, y),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      deps.cancelFrame(frameHandle);
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (options.minimap) options.minimap.style.visibility = "hidden";
      overlay.dispose();
      projectiles.dispose();
      shields.dispose();
      walls.dispose();
      mines.dispose();
      pickups.dispose();
      columns.dispose();
      aimGuide.dispose();
      models.clear();
      disposeTree(scene, [kit]);
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export function mountPreview(
  container: HTMLElement,
  kind: TankModelKind,
  color: number,
  deps: SceneDeps = browserDeps,
): PreviewHandle | null {
  let renderer: ReturnType<SceneDeps["createRenderer"]>;
  try {
    renderer = deps.createRenderer({ shadows: false, alpha: true });
  } catch {
    return null;
  }
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 2.2, 7.2);
  camera.lookAt(0, 0.7, 0);
  scene.add(new HemisphereLight(0xcfeaff, 0x1b2836, 1.6));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new DirectionalLight(0x6fe8ff, 1.6);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const pedestal = new Mesh(
    new CylinderGeometry(1.9, 2.1, 0.22, 40),
    new MeshStandardMaterial({
      color: 0x22313f,
      metalness: 0.7,
      roughness: 0.35,
      emissive: 0x0b3a4a,
    }),
  );
  pedestal.position.y = -0.11;
  scene.add(pedestal);
  const turntable = new Group();
  scene.add(turntable);
  const kit = createTankKit();
  let model: TankModel | null = null;
  let current = { kind, color };
  const fake: SceneTank = {
    role: "preview",
    name: "",
    kind,
    color,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    halfWidth: MODEL_SIZE[kind].halfWidth,
    height: MODEL_SIZE[kind].height,
    hp: 1,
    maxHp: 1,
    alive: true,
    aim: 24,
    shield: 0,
    leaping: false,
    local: false,
  };

  function build() {
    if (model) {
      turntable.remove(model.root);
      model.dispose();
    }
    model = new TankModel(kit, current.kind, current.color, true);
    model.root.position.x = 0;
    turntable.add(model.root);
  }
  build();

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(deps.pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = deps.observeResize(container, resize);
  resize();

  let disposed = false;
  let handle = 0;
  let last = deps.now();
  let time = 0;
  function tick() {
    if (disposed) return;
    const now = deps.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    turntable.rotation.y = time * 0.7;
    if (model) {
      fake.aim = 18 + Math.sin(time * 1.3) * 14;
      model.update(fake, dt, time, 1);
      model.root.position.set(0, 0, 0);
    }
    renderer.render(scene, camera);
    handle = deps.requestFrame(tick);
  }
  handle = deps.requestFrame(tick);

  return {
    setKind: (nextKind, nextColor) => {
      if (current.kind === nextKind && current.color === nextColor) return;
      current = { kind: nextKind, color: nextColor };
      fake.kind = nextKind;
      fake.color = nextColor;
      build();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      deps.cancelFrame(handle);
      observer.disconnect();
      disposeTree(scene, [kit]);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
