import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { buildArena } from "@kyzen/games-core";
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Scene,
} from "three";
import {
  PREVIEW_FRAMES,
  previewRequest,
} from "../src/games/tank-arena/previews";
import { mountArena } from "../src/games/tank-arena/scene/arena";
import {
  collectResources,
  disposeTree,
} from "../src/games/tank-arena/scene/dispose";
import { mergeNonIndexed } from "../src/games/tank-arena/scene/merge";
import {
  createPreviewStudio,
  type PreviewDeps,
  renderPreviews,
} from "../src/games/tank-arena/scene/preview";
import {
  pixelRatioCap,
  type SceneDeps,
} from "../src/games/tank-arena/scene/renderer";
import { createTerrain } from "../src/games/tank-arena/scene/terrain";
import type {
  SceneEvent,
  SceneFrame,
  SceneTank,
} from "../src/games/tank-arena/view";

type Calls = Record<string, number>;

function fakeCanvas(calls: Calls) {
  const listeners = new Map<string, unknown>();
  return {
    style: {} as Record<string, string>,
    setAttribute: () => {},
    addEventListener: (name: string, fn: unknown) => listeners.set(name, fn),
    removeEventListener: (name: string) => {
      listeners.delete(name);
      calls.removeListener = (calls.removeListener ?? 0) + 1;
    },
    remove: () => {
      calls.canvasRemoved = (calls.canvasRemoved ?? 0) + 1;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    listeners,
  };
}

function fakeDeps(calls: Calls) {
  const frames = new Map<number, (time: number) => void>();
  let next = 1;
  let now = 0;
  const canvas = fakeCanvas(calls);
  const bump = (key: string) => () => {
    calls[key] = (calls[key] ?? 0) + 1;
  };
  const deps: SceneDeps = {
    createRenderer: () =>
      ({
        domElement: canvas,
        setPixelRatio: bump("setPixelRatio"),
        setSize: bump("setSize"),
        getPixelRatio: () => 1,
        render: bump("render"),
        dispose: bump("rendererDispose"),
        forceContextLoss: bump("forceContextLoss"),
        shadowMap: { enabled: true },
      }) as unknown as ReturnType<SceneDeps["createRenderer"]>,
    createComposer: () => ({
      render: bump("composerRender"),
      setSize: bump("composerSize"),
      setPixelRatio: () => {},
      dispose: bump("composerDispose"),
    }),
    requestFrame: (callback) => {
      const id = next++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      frames.delete(id);
      calls.cancelFrame = (calls.cancelFrame ?? 0) + 1;
    },
    observeResize: () => ({ disconnect: bump("disconnect") }),
    now: () => now,
    pixelRatio: () => 2,
  };
  const step = (ms = 16) => {
    now += ms;
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, callback] of pending) callback(now);
  };
  return { deps, step, frames, canvas };
}

function container(calls: Calls) {
  return {
    clientWidth: 800,
    clientHeight: 450,
    appendChild: () => {
      calls.appended = (calls.appended ?? 0) + 1;
    },
  } as unknown as HTMLElement;
}

function tank(overrides: Partial<SceneTank>): SceneTank {
  return {
    role: "p1",
    name: "alpha",
    kind: "bastion",
    color: 0x3edcff,
    x: 7,
    y: 0,
    vx: 2,
    vy: 0,
    halfWidth: 1.4,
    height: 2.4,
    hp: 30,
    maxHp: 160,
    alive: true,
    aim: 45,
    shield: 2.3,
    leaping: false,
    local: true,
    ...overrides,
  };
}

const busyFrame: SceneFrame = {
  tanks: [
    tank({}),
    tank({
      role: "p2",
      kind: "kestrel",
      x: 25,
      color: 0xff4d5e,
      leaping: true,
      vy: 5,
      local: false,
    }),
  ],
  projectiles: [
    { id: "1", kind: "missile", x: 10, y: 5, vx: 10, vy: 3, color: 0xffffff },
    { id: "2", kind: "bomb", x: 30, y: 20, vx: 0, vy: -8, color: 0xffffff },
  ],
  walls: [{ id: "p1", x0: 9, y0: 0, x1: 9, y1: 3.2, color: 0x3edcff }],
  pickups: [
    { id: "3", kind: "repair", x: 6.5, y: 9.6 },
    { id: "4", kind: "coolant", x: 15, y: 17.5 },
  ],
  mines: [{ id: "5", x: 11, y: 0.25 }],
};

const allEvents: SceneEvent[] = [
  { type: "fire", role: "p1", x: 8, y: 2 },
  { type: "explode", x: 12, y: 3, radius: 3 },
  { type: "damage", role: "p2", amount: 12, color: 0xff4d5e },
  { type: "jump", role: "p1", x: 7, y: 0 },
  { type: "leap", role: "p2", x: 25, y: 0 },
  { type: "land", role: "p1", x: 7, y: 0 },
  { type: "shield", role: "p1" },
  { type: "wall", x: 9, y: 1.6 },
  { type: "split", x: 20, y: 12 },
  { type: "mine", x: 11, y: 0.25 },
  { type: "pickup", x: 6.5, y: 9.6, kind: "repair" },
  { type: "portal", y: 4 },
  { type: "splash", x: 15 },
  { type: "eliminate", role: "p2", x: 25, y: 0 },
];

function spyDisposals(root: Object3D) {
  const tracked = new Map<{ dispose: () => void }, number>();
  root.traverse((object) => {
    const mesh = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    const items: { dispose: () => void }[] = [];
    if (mesh.geometry) items.push(mesh.geometry);
    if (Array.isArray(mesh.material)) items.push(...mesh.material);
    else if (mesh.material) items.push(mesh.material);
    for (const item of items) {
      if (tracked.has(item)) continue;
      tracked.set(item, 0);
      const original = item.dispose.bind(item);
      item.dispose = () => {
        tracked.set(item, (tracked.get(item) ?? 0) + 1);
        original();
      };
    }
  });
  return tracked;
}

afterEach(() => {
  mock.restore();
});

function silenceConsole() {
  const error = spyOn(console, "error").mockImplementation(() => {});
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  return () => {
    expect(error.mock.calls).toEqual([]);
    expect(warn.mock.calls).toEqual([]);
  };
}

function attributeLayout(geometry: BufferGeometry) {
  return Object.keys(geometry.attributes).sort();
}

describe("arena scene lifecycle", () => {
  test("renders frames, plays every effect, and tears everything down", () => {
    const expectQuiet = silenceConsole();
    const calls: Calls = {};
    const { deps, step, frames } = fakeDeps(calls);
    const handle = mountArena(
      container(calls),
      {
        overlay: null,
        minimap: null,
        reducedMotion: false,
        onContextLost: () => {},
        onContextRestored: () => {},
      },
      deps,
    );
    if (!handle) throw new Error("scene failed to mount");
    const arena = buildArena(2);
    handle.setLayout({
      width: arena.width,
      waterY: arena.waterY,
      boxes: arena.boxes,
    });
    handle.setFrame(busyFrame);
    handle.setAim({
      role: "p1",
      points: [
        { x: 8, y: 2 },
        { x: 9, y: 3 },
      ],
      locked: false,
      wall: { x0: 9, y0: 0, x1: 9, y1: 3 },
      shieldRadius: 2.3,
      target: { x: 12, y: 6 },
    });
    handle.setAirstrike([10, 30, 50]);
    handle.setInsets({ top: 60, bottom: 120 });
    let ticks = 0;
    handle.setTicker(() => {
      ticks += 1;
    });
    handle.emit(allEvents);
    for (let i = 0; i < 20; i++) step();
    handle.setFocus({ mode: "action" });
    handle.setFrame({ ...busyFrame, tanks: busyFrame.tanks.slice(0, 1) });
    for (let i = 0; i < 5; i++) step();
    expect(ticks).toBe(25);
    expect(calls.composerRender).toBe(25);
    expect(calls.appended).toBe(1);
    expect(calls.setSize).toBeGreaterThanOrEqual(1);
    expect(handle.worldToScreen(32, 0)).not.toBeNull();
    expect(handle.screenToWorld(400, 225)).not.toBeNull();

    const disposals = spyDisposals(handle.scene);
    expect(disposals.size).toBeGreaterThan(40);
    handle.dispose();
    expect(calls.cancelFrame).toBe(1);
    expect(frames.size).toBe(0);
    expect(calls.disconnect).toBe(1);
    expect(calls.composerDispose).toBe(1);
    expect(calls.rendererDispose).toBe(1);
    expect(calls.forceContextLoss).toBe(1);
    expect(calls.canvasRemoved).toBe(1);
    expect(calls.removeListener).toBe(2);
    const missed = [...disposals.entries()].filter(([, count]) => count === 0);
    expect(missed.length).toBe(0);
    expect(handle.scene.children.length).toBe(0);
    handle.dispose();
    expect(calls.rendererDispose).toBe(1);
    expectQuiet();
  });

  test("reports WebGL failure instead of throwing", () => {
    const calls: Calls = {};
    const { deps } = fakeDeps(calls);
    const failing: SceneDeps = {
      ...deps,
      createRenderer: () => {
        throw new Error("Error creating WebGL context.");
      },
    };
    expect(
      mountArena(
        container(calls),
        {
          overlay: null,
          minimap: null,
          reducedMotion: true,
          onContextLost: () => {},
          onContextRestored: () => {},
        },
        failing,
      ),
    ).toBeNull();
    expect(calls.appended).toBeUndefined();
  });

  test("a lost context pauses rendering and a restored one is reported", () => {
    const calls: Calls = {};
    const { deps, canvas, step, frames } = fakeDeps(calls);
    let lost = 0;
    let restored = 0;
    const handle = mountArena(
      container(calls),
      {
        overlay: null,
        minimap: null,
        reducedMotion: false,
        onContextLost: () => {
          lost += 1;
        },
        onContextRestored: () => {
          restored += 1;
        },
      },
      deps,
    );
    step();
    expect(calls.composerRender).toBe(1);
    let prevented = false;
    const onLost = canvas.listeners.get("webglcontextlost") as (event: {
      preventDefault: () => void;
    }) => void;
    onLost({
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(lost).toBe(1);
    expect(frames.size).toBe(0);
    step();
    expect(calls.composerRender).toBe(1);
    const onRestored = canvas.listeners.get("webglcontextrestored") as
      | (() => void)
      | undefined;
    onRestored?.();
    expect(restored).toBe(1);
    handle?.dispose();
  });

  test("the replay ticker gets real elapsed time even when frames are slow", () => {
    const calls: Calls = {};
    const { deps, step } = fakeDeps(calls);
    const handle = mountArena(
      container(calls),
      {
        overlay: null,
        minimap: null,
        reducedMotion: false,
        onContextLost: () => {},
        onContextRestored: () => {},
      },
      deps,
    );
    if (!handle) throw new Error("scene failed to mount");
    step(40);
    const received: number[] = [];
    handle.setTicker((ms) => received.push(ms));
    step(125);
    step(125);
    step(16);
    expect(received).toEqual([125, 125, 16]);
    handle.dispose();
  });
});

describe("tank preview studio", () => {
  test("poses one shared turntable per tank and releases it", () => {
    const expectQuiet = silenceConsole();
    const angles: number[] = [];
    const calls = { render: 0, compile: 0 };
    const studio = createPreviewStudio(
      {
        render: () => {
          calls.render += 1;
          angles.push(studio.turntable.rotation.y);
        },
        compile: () => {
          calls.compile += 1;
        },
      },
      1.5,
    );
    studio.compile("bastion", 0x3edcff);
    studio.compile("kestrel", 0x3edcff);
    for (let i = 0; i < 12; i++) studio.render("bastion", 0x3edcff, i, 12);
    expect(calls).toEqual({ render: 12, compile: 2 });
    expect(studio.turntable.children.length).toBe(1);
    const step = (angles[1] ?? 0) - (angles[0] ?? 0);
    expect(step).toBeCloseTo((Math.PI * 2) / 12, 6);
    expect((angles[11] ?? 0) - (angles[0] ?? 0)).toBeCloseTo(
      (Math.PI * 2 * 11) / 12,
      6,
    );
    studio.dispose();
    expect(studio.turntable.children.length).toBe(0);
    expectQuiet();
  });

  function previewHarness(settleAfter = 2) {
    const frames = new Map<number, () => void>();
    let next = 1;
    let clock = 0;
    const stats = { renders: 0, captures: 0, closed: 0, disposed: 0, polls: 0 };
    const perSlice: number[] = [];
    const deps: PreviewDeps = {
      createSurface: () => ({
        compile: () => {},
        render: () => {
          stats.renders += 1;
          clock += 3;
        },
        settled: () => {
          stats.polls += 1;
          return stats.polls > settleAfter;
        },
        capture: () => {
          stats.captures += 1;
          return Promise.resolve({
            close: () => {
              stats.closed += 1;
            },
          } as unknown as ImageBitmap);
        },
        dispose: () => {
          stats.disposed += 1;
        },
      }),
      requestFrame: (callback) => {
        const id = next++;
        frames.set(id, callback);
        return id;
      },
      cancelFrame: (id) => {
        frames.delete(id);
      },
      now: () => clock,
    };
    const step = () => {
      const before = stats.renders;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
      perSlice.push(stats.renders - before);
      return pending.length > 0;
    };
    return { deps, stats, perSlice, step, pending: () => frames.size };
  }

  test("previews render in small slices across animation frames", async () => {
    const expectQuiet = silenceConsole();
    const { deps, stats, perSlice, step, pending } = previewHarness();
    const delivered: [string, number][] = [];
    renderPreviews(
      previewRequest(0x3edcff, 1),
      (kind, frames) => delivered.push([kind, frames.length]),
      deps,
    );
    let slices = 0;
    while (step()) slices += 1;
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stats.renders).toBe(PREVIEW_FRAMES * 2);
    expect(stats.polls).toBe(3);
    expect(Math.max(...perSlice)).toBeLessThanOrEqual(3);
    expect(slices).toBeGreaterThan(20);
    expect(delivered).toEqual([
      ["bastion", PREVIEW_FRAMES],
      ["kestrel", PREVIEW_FRAMES],
    ]);
    expect(stats.disposed).toBe(1);
    expect(stats.closed).toBe(0);
    expect(pending()).toBe(0);
    expectQuiet();
  });

  test("cancelling a preview job releases every captured frame", async () => {
    const { deps, stats, step } = previewHarness(0);
    const delivered: string[] = [];
    const job = renderPreviews(
      previewRequest(0x3edcff, 1),
      (kind) => delivered.push(kind),
      deps,
    );
    for (let i = 0; i < 5; i++) step();
    job.cancel();
    expect(step()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stats.captures).toBeGreaterThan(0);
    expect(stats.closed).toBe(stats.captures);
    expect(stats.disposed).toBe(1);
    expect(delivered).toEqual([]);
  });

  test("preview frames are small and capped in resolution", () => {
    const low = previewRequest(0x3edcff, 1);
    expect(low).toEqual({
      color: 0x3edcff,
      kinds: ["bastion", "kestrel"],
      frames: PREVIEW_FRAMES,
      width: 240,
      height: 160,
    });
    expect(previewRequest(0x3edcff, 3)).toMatchObject({
      width: 360,
      height: 240,
    });
    expect(previewRequest(0x3edcff, Number.NaN).height).toBe(160);
  });
});

describe("geometry merging", () => {
  test("flattens indexed parts so mixed inputs share one layout", () => {
    const expectQuiet = silenceConsole();
    const indexed = new CylinderGeometry(0.3, 0.3, 1, 8);
    const flat = new BoxGeometry(1, 1, 1).toNonIndexed();
    const expected =
      (indexed.index?.count ?? 0) + flat.getAttribute("position").count;
    const merged = mergeNonIndexed([flat, indexed]);
    expect(merged.index).toBeNull();
    expect(merged.getAttribute("position").count).toBe(expected);
    expect(attributeLayout(merged)).toEqual(["normal", "position", "uv"]);
    expectQuiet();
  });

  test("builds every terrain bucket as one non-indexed mesh", () => {
    const expectQuiet = silenceConsole();
    const terrain = createTerrain(buildArena(4).boxes);
    const meshes = terrain.children.filter(
      (child): child is Mesh => child instanceof Mesh,
    );
    expect(meshes.length).toBe(9);
    for (const mesh of meshes) {
      expect(mesh.geometry.index).toBeNull();
      expect(attributeLayout(mesh.geometry)).toEqual([
        "normal",
        "position",
        "uv",
      ]);
      expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(0);
    }
    disposeTree(terrain);
    expectQuiet();
  });
});

describe("disposal helpers", () => {
  test("collects geometries, materials, and instanced buffers once", () => {
    const scene = new Scene();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const instanced = new InstancedMesh(geometry, material, 4);
    scene.add(instanced);
    const resources = collectResources(scene);
    expect(resources.has(geometry)).toBe(true);
    expect(resources.has(material)).toBe(true);
    expect(resources.size).toBe(3);
    let disposed = 0;
    geometry.addEventListener("dispose", () => {
      disposed += 1;
    });
    disposeTree(scene);
    expect(disposed).toBe(1);
    expect(scene.children.length).toBe(0);
  });

  test("device pixel ratio is capped at two", () => {
    expect(pixelRatioCap(3)).toBe(2);
    expect(pixelRatioCap(1.5)).toBe(1.5);
    expect(pixelRatioCap(Number.NaN)).toBe(1);
    expect(pixelRatioCap(0)).toBe(1);
  });
});
