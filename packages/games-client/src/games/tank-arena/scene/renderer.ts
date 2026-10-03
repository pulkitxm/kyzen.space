import {
  ACESFilmicToneMapping,
  type Camera,
  PCFShadowMap,
  type Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const MAX_PIXEL_RATIO = 2;

type RendererLike = Pick<
  WebGLRenderer,
  | "domElement"
  | "setPixelRatio"
  | "setSize"
  | "getPixelRatio"
  | "render"
  | "dispose"
  | "forceContextLoss"
  | "shadowMap"
>;

type ComposerLike = {
  render: (delta?: number) => void;
  setSize: (width: number, height: number) => void;
  setPixelRatio: (ratio: number) => void;
  dispose: () => void;
};

export type SceneDeps = {
  createRenderer: (options: {
    shadows: boolean;
    alpha: boolean;
  }) => RendererLike;
  createComposer: (
    renderer: RendererLike,
    scene: Scene,
    camera: Camera,
  ) => ComposerLike;
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (handle: number) => void;
  observeResize: (
    element: HTMLElement,
    callback: () => void,
  ) => { disconnect: () => void };
  now: () => number;
  pixelRatio: () => number;
};

export function pixelRatioCap(devicePixelRatio: number) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
}

function createWebGLRenderer(options: { shadows: boolean; alpha: boolean }) {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: options.alpha,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = options.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  return renderer;
}

function createBloomComposer(
  renderer: RendererLike,
  scene: Scene,
  camera: Camera,
): ComposerLike {
  const composer = new EffectComposer(renderer as WebGLRenderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.62, 0.55, 0.78);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  return {
    render: (delta) => composer.render(delta),
    setSize: (width, height) => composer.setSize(width, height),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    dispose: () => {
      renderPass.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}

export const browserDeps: SceneDeps = {
  createRenderer: createWebGLRenderer,
  createComposer: createBloomComposer,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  observeResize: (element, callback) => {
    const observer = new ResizeObserver(() => callback());
    observer.observe(element);
    let media: MediaQueryList | null = null;
    const onChange = () => {
      callback();
      listen();
    };
    const listen = () => {
      media?.removeEventListener("change", onChange);
      media =
        typeof matchMedia === "function"
          ? matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`)
          : null;
      media?.addEventListener("change", onChange);
    };
    listen();
    return {
      disconnect: () => {
        observer.disconnect();
        media?.removeEventListener("change", onChange);
        media = null;
      },
    };
  },
  now: () => performance.now(),
  pixelRatio: () => pixelRatioCap(globalThis.devicePixelRatio ?? 1),
};
