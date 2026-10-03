import {
  ACESFilmicToneMapping,
  type Camera,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { PreviewRequest, SceneTank, TankModelKind } from "../view";
import { disposeTree } from "./dispose";
import { createTankKit, MODEL_SIZE, TankModel } from "./tanks";

const REST_ANGLE = -Math.PI / 6;
const FRAME_SECONDS = 1 / 12;

export type StudioRenderer = {
  render: (scene: Scene, camera: Camera) => void;
  compile: (scene: Scene, camera: Camera) => unknown;
};

export function createPreviewStudio(renderer: StudioRenderer, aspect: number) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, aspect, 0.1, 50);
  camera.position.set(0, 2.6, 9);
  camera.lookAt(0, 1.05, 0);
  scene.add(new HemisphereLight(0xcfeaff, 0x1b2836, 1.6));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  const rim = new DirectionalLight(0x6fe8ff, 1.6);
  rim.position.set(-4, 2, -3);
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
  const turntable = new Group();
  scene.add(key, rim, pedestal, turntable);
  const kit = createTankKit();
  let model: TankModel | null = null;
  let posed = "";
  const tank: SceneTank = {
    role: "preview",
    name: "",
    kind: "bastion",
    color: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    halfWidth: MODEL_SIZE.bastion.halfWidth,
    height: MODEL_SIZE.bastion.height,
    hp: 1,
    maxHp: 1,
    alive: true,
    aim: 24,
    shield: 0,
    leaping: false,
    local: false,
  };

  function pose(
    kind: TankModelKind,
    color: number,
    index: number,
    frames: number,
  ) {
    const next = `${kind}:${color}`;
    if (!model || posed !== next) {
      if (model) {
        turntable.remove(model.root);
        model.dispose();
      }
      model = new TankModel(kit, kind, color, true);
      turntable.add(model.root);
      posed = next;
      tank.kind = kind;
      tank.color = color;
      tank.halfWidth = MODEL_SIZE[kind].halfWidth;
      tank.height = MODEL_SIZE[kind].height;
    }
    const phase = (index / frames) * Math.PI * 2;
    turntable.rotation.y = REST_ANGLE + phase;
    tank.aim = 18 + Math.sin(phase * 2) * 14;
    model.update(tank, 1, index * FRAME_SECONDS, 1);
  }

  return {
    turntable,
    compile: (kind: TankModelKind, color: number) => {
      pose(kind, color, 0, 1);
      renderer.compile(scene, camera);
    },
    render: (
      kind: TankModelKind,
      color: number,
      index: number,
      frames: number,
    ) => {
      pose(kind, color, index, frames);
      renderer.render(scene, camera);
    },
    dispose: () => {
      if (model) {
        turntable.remove(model.root);
        model.dispose();
        model = null;
      }
      disposeTree(scene, [kit]);
    },
  };
}

type PreviewSurface = StudioRenderer & {
  settled: () => boolean;
  capture: () => Promise<ImageBitmap>;
  dispose: () => void;
};

export type PreviewDeps = {
  createSurface: (width: number, height: number) => PreviewSurface;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
};

const SLICE_MS = 8;

function createBrowserSurface(width: number, height: number): PreviewSurface {
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setSize(width, height, false);
  const parallel = renderer.extensions.has("KHR_parallel_shader_compile");
  let compiling = 0;
  const compiled = () => {
    compiling -= 1;
  };
  return {
    compile: (scene, camera) => {
      if (!parallel) {
        renderer.compile(scene, camera);
        return;
      }
      compiling += 1;
      renderer.compileAsync(scene, camera).then(compiled, compiled);
    },
    render: (scene, camera) => renderer.render(scene, camera),
    settled: () => !parallel || compiling === 0,
    capture: () => createImageBitmap(canvas),
    dispose: () => {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

const browserPreviewDeps: PreviewDeps = {
  createSurface: createBrowserSurface,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

function closeAll(bitmaps: Promise<ImageBitmap>[]) {
  Promise.all(bitmaps)
    .then((list) => {
      for (const bitmap of list) bitmap.close();
    })
    .catch(() => {});
}

function* previewSteps(
  request: PreviewRequest,
  deps: PreviewDeps,
  deliver: (kind: TankModelKind, frames: ImageBitmap[]) => void,
): Generator<"frame" | "slice"> {
  const surface = deps.createSurface(request.width, request.height);
  const studio = createPreviewStudio(surface, request.width / request.height);
  const pending: Promise<unknown>[] = [];
  let partial: Promise<ImageBitmap>[] = [];
  try {
    for (const kind of request.kinds) studio.compile(kind, request.color);
    while (!surface.settled()) yield "frame";
    for (const kind of request.kinds) {
      partial = [];
      for (let i = 0; i < request.frames; i++) {
        studio.render(kind, request.color, i, request.frames);
        partial.push(surface.capture());
        yield "slice";
      }
      const captured = partial;
      partial = [];
      pending.push(
        Promise.all(captured).then((frames) => deliver(kind, frames)),
      );
    }
  } finally {
    closeAll(partial);
    pending.push(...partial);
    Promise.allSettled(pending).then(() => {
      studio.dispose();
      surface.dispose();
    });
  }
}

export function renderPreviews(
  request: PreviewRequest,
  onFrames: (kind: TankModelKind, frames: ImageBitmap[]) => void,
  deps: PreviewDeps = browserPreviewDeps,
) {
  let cancelled = false;
  let handle = 0;
  const steps = previewSteps(request, deps, (kind, frames) => {
    if (cancelled) {
      for (const bitmap of frames) bitmap.close();
      return;
    }
    onFrames(kind, frames);
  });
  const run = () => {
    if (cancelled) return;
    const start = deps.now();
    try {
      for (;;) {
        const step = steps.next();
        if (step.done) return;
        if (step.value === "frame" || deps.now() - start >= SLICE_MS) break;
      }
    } catch {
      return;
    }
    handle = deps.requestFrame(run);
  };
  handle = deps.requestFrame(run);
  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      deps.cancelFrame(handle);
      steps.return(undefined);
    },
  };
}
