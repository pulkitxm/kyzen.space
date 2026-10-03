"use client";

import {
  type CarFootballMove,
  type CarFootballState,
  carFootballStateSchema,
} from "@kyzen/shared/types";
import { useEffect, useRef, useState } from "react";
import {
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaArrowUp,
  FaBolt,
  FaCarSide,
} from "react-icons/fa6";
import * as THREE from "three";
import { useGameAudio } from "../../audio/use-game-audio";
import type { GameClientProps } from "../../types";

const COLORS = {
  blue: 0x38bdf8,
  orange: 0xfb923c,
};

function makeCar(team: "blue" | "orange") {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: COLORS[team],
    metalness: 0.55,
    roughness: 0.27,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x10202d,
    metalness: 0.3,
    roughness: 0.45,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xb7edff,
    metalness: 0.2,
    roughness: 0.1,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: COLORS[team],
    emissive: COLORS[team],
    emissiveIntensity: 1.5,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 1.8), paint);
  body.position.y = 0.68;
  body.castShadow = true;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.55), trim);
  nose.position.set(1.42, 0.57, 0);
  group.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.65, 1.3), glass);
  cabin.position.set(-0.25, 1.32, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 0.16), trim);
  stripe.position.set(0.1, 1.06, 0);
  group.add(stripe);
  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.3, 16);
  wheelGeometry.rotateX(Math.PI / 2);
  for (const x of [-1.05, 1.05]) {
    for (const z of [-1.02, 1.02]) {
      const wheel = new THREE.Mesh(wheelGeometry, trim);
      wheel.position.set(x, 0.43, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  for (const z of [-0.48, 0.48]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.34), glow);
    light.position.set(-1.75, 0.72, z);
    group.add(light);
  }
  return group;
}

function addLine(
  scene: THREE.Scene,
  points: [number, number][],
  color = 0xd9f6ff,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map(([x, z]) => new THREE.Vector3(x, 0.04, z)),
  );
  scene.add(
    new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.68 }),
    ),
  );
}

function addArena(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x071727);
  scene.fog = new THREE.Fog(0x071727, 65, 125);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 50),
    new THREE.MeshStandardMaterial({
      color: 0x123d49,
      roughness: 0.9,
      metalness: 0.05,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  for (let x = -35; x < 40; x += 10) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 50),
      new THREE.MeshStandardMaterial({ color: 0x164c58, roughness: 0.95 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.012, 0);
    scene.add(strip);
  }

  addLine(scene, [
    [0, -25],
    [0, 25],
  ]);
  addLine(scene, [
    [-40, -25],
    [40, -25],
    [40, 25],
    [-40, 25],
    [-40, -25],
  ]);
  const circle: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    circle.push([Math.cos(angle) * 7, Math.sin(angle) * 7]);
  }
  addLine(scene, circle);
  for (const side of [-1, 1]) {
    addLine(scene, [
      [side * 40, -14],
      [side * 31, -14],
      [side * 31, 14],
      [side * 40, 14],
    ]);
    const goalMaterial = new THREE.MeshStandardMaterial({
      color: side < 0 ? COLORS.blue : COLORS.orange,
      emissive: side < 0 ? COLORS.blue : COLORS.orange,
      emissiveIntensity: 0.5,
      metalness: 0.5,
    });
    const postGeometry = new THREE.CylinderGeometry(0.25, 0.25, 7, 12);
    for (const z of [-8, 8]) {
      const post = new THREE.Mesh(postGeometry, goalMaterial);
      post.position.set(side * 40, 3.5, z);
      scene.add(post);
    }
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 16, 12),
      goalMaterial,
    );
    bar.rotation.x = Math.PI / 2;
    bar.position.set(side * 40, 7, 0);
    scene.add(bar);
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(3, 7, 16),
      new THREE.MeshStandardMaterial({
        color: side < 0 ? 0x175775 : 0x70442a,
        transparent: true,
        opacity: 0.17,
      }),
    );
    net.position.set(side * 41.5, 3.5, 0);
    scene.add(net);
  }

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x307184,
    transparent: true,
    opacity: 0.32,
  });
  for (const z of [-25, 25]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(80, 5, 0.4),
      wallMaterial,
    );
    wall.position.set(0, 2.5, z);
    scene.add(wall);
  }
  scene.add(new THREE.HemisphereLight(0xc7eeff, 0x0b2630, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(-18, 40, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);
  for (const side of [-1, 1]) {
    const flood = new THREE.PointLight(
      side < 0 ? COLORS.blue : COLORS.orange,
      40,
      50,
    );
    flood.position.set(side * 36, 11, 0);
    scene.add(flood);
  }
}

function makeBall() {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.8, 2),
    new THREE.MeshStandardMaterial({
      color: 0xf4f7ef,
      metalness: 0.16,
      roughness: 0.3,
    }),
  );
  ball.castShadow = true;
  group.add(ball);
  const seams = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.81, 1)),
    new THREE.LineBasicMaterial({
      color: 0x31525a,
      transparent: true,
      opacity: 0.45,
    }),
  );
  group.add(seams);
  return group;
}

function controlFromKeys(keys: Set<string>): CarFootballMove {
  return {
    throttle:
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown")),
    steer:
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft")),
    jump: keys.has("Space"),
    boost: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    handbrake: keys.has("ControlLeft") || keys.has("ControlRight"),
  };
}

function TouchButton({
  code,
  label,
  children,
  keys,
}: {
  code: string;
  label: string;
  children: React.ReactNode;
  keys: React.RefObject<Set<string>>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-14 touch-none items-center justify-center rounded-2xl border border-white/35 bg-[#071727]/75 text-white text-xl shadow-lg backdrop-blur-md active:bg-white/25"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        keys.current.add(code);
      }}
      onPointerUp={() => keys.current.delete(code)}
      onPointerCancel={() => keys.current.delete(code)}
      onLostPointerCapture={() => keys.current.delete(code)}
    >
      {children}
    </button>
  );
}

export function CarFootballGameClient({
  game,
  connected,
  userId,
  makeMove,
}: GameClientProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<CarFootballState | null>(null);
  const moveRef = useRef(makeMove);
  const controlKeysRef = useRef(new Set<string>());
  const previousScoreRef = useRef<number | null>(null);
  const wasGroundedRef = useRef(true);
  const audio = useGameAudio();
  const [renderError, setRenderError] = useState(false);
  const parsed = carFootballStateSchema.safeParse(game.gameState);
  const state = parsed.success ? parsed.data : null;
  const role =
    game.players.find((player) => player.userId === userId)?.role ?? null;
  const controlled = Boolean(role && connected && game.status === "active");
  const localCar = state?.cars.find((car) => car.role === role);
  stateRef.current = state;
  moveRef.current = makeMove;

  useEffect(() => {
    if (!state) return;
    const total = state.score.blue + state.score.orange;
    if (previousScoreRef.current !== null && total > previousScoreRef.current)
      audio.playWin();
    previousScoreRef.current = total;
    if (localCar) {
      if (wasGroundedRef.current && !localCar.grounded) audio.playTouch();
      wasGroundedRef.current = localCar.grounded;
    }
  }, [state, localCar, audio]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setRenderError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    addArena(scene);
    const ball = makeBall();
    scene.add(ball);
    const cars = new Map<string, THREE.Group>();
    for (const car of stateRef.current?.cars ?? []) {
      const mesh = makeCar(car.team);
      cars.set(car.role, mesh);
      scene.add(mesh);
    }
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
    camera.position.set(0, 35, 48);
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const target = new THREE.Vector3();
    const tick = () => {
      const current = stateRef.current;
      if (current) {
        ball.position.lerp(
          new THREE.Vector3(
            current.ball.position.x,
            current.ball.position.z,
            current.ball.position.y,
          ),
          0.32,
        );
        ball.rotation.z +=
          Math.hypot(current.ball.velocity.x, current.ball.velocity.y) * 0.0008;
        for (const car of current.cars) {
          const mesh = cars.get(car.role);
          if (!mesh) continue;
          mesh.position.lerp(
            new THREE.Vector3(
              car.position.x,
              car.position.z - 0.8,
              car.position.y,
            ),
            0.36,
          );
          mesh.rotation.y +=
            Math.atan2(
              Math.sin(-car.yaw - mesh.rotation.y),
              Math.cos(-car.yaw - mesh.rotation.y),
            ) * 0.3;
        }
        const own = current.cars.find((car) => car.role === role);
        if (own) {
          const directionX = Math.cos(own.yaw);
          const directionZ = Math.sin(own.yaw);
          target.set(
            THREE.MathUtils.clamp(own.position.x - directionX * 13, -36, 36),
            own.position.z + 8,
            THREE.MathUtils.clamp(own.position.y - directionZ * 13, -22, 22),
          );
          camera.position.lerp(target, 0.08);
          camera.lookAt(
            own.position.x + directionX * 7,
            own.position.z + 1.5,
            own.position.y + directionZ * 7,
          );
        } else {
          camera.position.lerp(new THREE.Vector3(0, 40, 48), 0.04);
          camera.lookAt(0, 0, 0);
        }
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [role]);

  useEffect(() => {
    if (!controlled) return;
    const keys = controlKeysRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      keys.add(event.code);
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.code,
        )
      )
        event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const clear = () => keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    const timer = window.setInterval(
      () => moveRef.current(controlFromKeys(keys)),
      50,
    );
    return () => {
      keys.clear();
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, [controlled]);

  if (!state)
    return (
      <div className="flex h-full items-center justify-center">
        Arena is loading
      </div>
    );
  const clock = `${Math.floor(state.timeRemaining / 60)}:${Math.floor(
    state.timeRemaining % 60,
  )
    .toString()
    .padStart(2, "0")}`;

  return (
    <div className="relative h-full min-h-107.5 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#071727] text-white shadow-2xl">
      <div
        ref={hostRef}
        className="absolute inset-0"
        role="img"
        aria-label="3D car football arena"
      />
      {renderError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#071727] p-6 text-center">
          This browser could not start the 3D arena.
        </div>
      ) : null}
      <div className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-white/20 bg-[#071727]/80 px-5 py-3 font-bold shadow-xl backdrop-blur-md">
        <span className="text-sky-300">{state.score.blue}</span>
        <span className="min-w-13 text-center text-sm tabular-nums">
          {state.phase === "overtime" ? "OT" : clock}
        </span>
        <span className="text-orange-300">{state.score.orange}</span>
      </div>
      {state.phase === "kickoff" || state.phase === "goal" ? (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[#071727]/75 px-8 py-5 text-center font-black text-2xl tracking-wide backdrop-blur-md">
          {state.phase === "goal"
            ? `${state.lastScorer?.toUpperCase()} GOAL`
            : "KICKOFF"}
          <div className="mt-1 text-base">
            {Math.ceil(state.pauseRemaining)}
          </div>
        </div>
      ) : null}
      {localCar ? (
        <div className="pointer-events-none absolute right-4 bottom-34 rounded-full border-4 border-white/20 bg-[#071727]/85 px-5 py-3 text-center shadow-xl md:bottom-4">
          <div className="font-black text-2xl tabular-nums">
            {Math.round(localCar.boost)}
          </div>
          <div className="text-[10px] tracking-widest">BOOST</div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-4 left-4 hidden rounded-lg bg-[#071727]/75 px-3 py-2 text-white/80 text-xs backdrop-blur-sm md:block">
        W/S drive · A/D steer · Space jump · Shift boost · Ctrl handbrake
      </div>
      {controlled ? (
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between md:hidden">
          <div className="grid grid-cols-3 gap-1.5">
            <div />
            <TouchButton
              code="KeyW"
              label="Drive forward"
              keys={controlKeysRef}
            >
              <FaArrowUp aria-hidden="true" />
            </TouchButton>
            <div />
            <TouchButton code="KeyA" label="Steer left" keys={controlKeysRef}>
              <FaArrowLeft aria-hidden="true" />
            </TouchButton>
            <TouchButton code="KeyS" label="Reverse" keys={controlKeysRef}>
              <FaArrowDown aria-hidden="true" />
            </TouchButton>
            <TouchButton code="KeyD" label="Steer right" keys={controlKeysRef}>
              <FaArrowRight aria-hidden="true" />
            </TouchButton>
          </div>
          <div className="flex gap-2">
            <TouchButton code="Space" label="Jump" keys={controlKeysRef}>
              <FaCarSide aria-hidden="true" />
            </TouchButton>
            <TouchButton code="ShiftLeft" label="Boost" keys={controlKeysRef}>
              <FaBolt aria-hidden="true" />
            </TouchButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
