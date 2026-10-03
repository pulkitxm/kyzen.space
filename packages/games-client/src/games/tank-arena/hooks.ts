"use client";

import {
  arenaWidth,
  buildArena,
  isJumpAction,
  previewTrajectory,
  shieldRadius,
  TANKS,
  tankArenaEngine,
} from "@kyzen/games-core";
import type { TankAction, TankArenaState, TankKind } from "@kyzen/shared/types";
import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TankAudio } from "./audio";
import {
  type Aim,
  aimTarget,
  airstrikeWarning,
  type BoardMode,
  clampAim,
  defaultAim,
  tankOf,
} from "./model";
import {
  buildReplay,
  interpolateFrame,
  replayCursor,
  replayDurationMs,
  replayOffset,
  type SceneContext,
  stateScene,
} from "./replay";
import type { AimPreview, ArenaHandle, CameraFocus } from "./view";

export type SceneState = { handle: ArenaHandle | null; failed: boolean };

const DOT_SPACING = 0.6;
const MAX_DOTS = 160;
const LOCK_RETRY_MS = 5000;
const SOUND_WINDOW_MS = 300;

function roundTimeOf(state: TankArenaState) {
  return tankArenaEngine.roundTimeMs?.(state) ?? 0;
}

function initialReplayDone(
  state: TankArenaState,
  deadline: number | null,
  now: number,
): number | null {
  const resolution = state.resolution;
  if (!resolution) return null;
  const offset = replayOffset({
    now,
    deadline,
    roundTimeMs: roundTimeOf(state),
    durationMs: replayDurationMs(resolution.steps),
  });
  return offset === null ? resolution.round : null;
}

export function usePlanState(state: TankArenaState, role: string | null) {
  const kind = tankOf(state, role)?.kind ?? null;
  const [plan, setPlan] = useState(() => ({
    round: state.round,
    action: "missile" as TankAction,
    aim: defaultAim(state, role),
  }));
  if (plan.round !== state.round) {
    setPlan({
      round: state.round,
      action:
        plan.action === "specialA" || plan.action === "specialB"
          ? "missile"
          : plan.action,
      aim: clampAim(plan.aim, isJumpAction(kind, plan.action)),
    });
  }
  const setAction = useCallback(
    (action: TankAction) =>
      setPlan((current) => ({
        ...current,
        action,
        aim: clampAim(current.aim, isJumpAction(kind, action)),
      })),
    [kind],
  );
  const setAim = useCallback(
    (aim: Aim) =>
      setPlan((current) => ({
        ...current,
        aim: clampAim(aim, isJumpAction(kind, current.action)),
      })),
    [kind],
  );
  return { action: plan.action, aim: plan.aim, setAction, setAim };
}

function sampleDots(
  points: readonly { x: number; y: number }[],
  width: number,
  spacing = DOT_SPACING,
) {
  const dots: { x: number; y: number }[] = [];
  let carried = spacing;
  let previous = points[0];
  if (!previous) return dots;
  for (const point of points) {
    let dx = point.x - previous.x;
    if (Math.abs(dx) > width / 2) dx = 0;
    const dy = point.y - previous.y;
    carried += Math.sqrt(dx * dx + dy * dy);
    previous = point;
    if (carried >= spacing) {
      carried = 0;
      dots.push({ x: point.x, y: point.y });
      if (dots.length >= MAX_DOTS) break;
    }
  }
  return dots;
}

export function aimPreview(
  state: TankArenaState,
  role: string | null,
  action: TankAction,
  aim: Aim,
  locked: boolean,
): AimPreview | null {
  const tank = tankOf(state, role);
  if (!role || !tank?.alive || !tank.kind) return null;
  const kind: TankKind = tank.kind;
  const center = { x: tank.x, y: tank.y };
  if (action === "shield" || action === "idle") {
    return {
      role,
      points: [],
      locked,
      wall: null,
      shieldRadius: action === "shield" ? shieldRadius(kind) : 0,
      target: null,
    };
  }
  const preview = previewTrajectory(state, role, action, aim.angle, aim.power);
  if (action === "specialB" && kind === "bastion") {
    const [a, b] = preview.points;
    return {
      role,
      points: [],
      locked,
      wall: a && b ? { x0: a.x, y0: a.y, x1: b.x, y1: b.y } : null,
      shieldRadius: 0,
      target: aimTarget(center, aim),
    };
  }
  const visible = Math.max(
    2,
    Math.ceil(preview.points.length * preview.visibleFraction),
  );
  const jumpLike = isJumpAction(kind, action);
  const lift = jumpLike ? -TANKS[kind].halfHeight + 0.15 : 0;
  const dots = sampleDots(
    preview.points.slice(0, visible).map((p) => ({ x: p.x, y: p.y + lift })),
    arenaWidth(state),
  );
  return {
    role,
    points: dots,
    locked,
    wall: null,
    shieldRadius: 0,
    target: aimTarget(center, aim),
  };
}

export function useResolutionReplay(input: {
  state: TankArenaState;
  ctx: SceneContext;
  scene: SceneState;
  deadline: number | null;
  sounds: TankAudio;
}) {
  const { state, ctx, scene, deadline, sounds } = input;
  const round = state.resolution?.round ?? null;
  const [done, setDone] = useState<number | null>(() =>
    initialReplayDone(state, deadline, Date.now()),
  );
  const mountedRound = useRef(round);
  const active = round !== null && done !== round;
  const finish = useCallback(() => setDone(round), [round]);

  const start = useEffectEvent((handle: ArenaHandle) => {
    const resolution = state.resolution;
    const aims = new Map<string, number>();
    if (resolution) {
      for (const [role, plan] of Object.entries(resolution.plans)) {
        aims.set(role, plan.angle);
      }
    }
    const data = buildReplay(state, ctx, aims);
    if (!data || data.frames.length < 2) {
      setDone(round);
      return () => {};
    }
    const offset = replayOffset({
      now: Date.now(),
      deadline,
      roundTimeMs: roundTimeOf(state),
      durationMs: data.durationMs,
    });
    const liveArrival = mountedRound.current !== round;
    let elapsed = offset ?? (liveArrival ? 0 : data.durationMs);
    let emitted = replayCursor(elapsed, data.frames.length).index;
    const first = data.frames[emitted] ?? data.frames[0];
    if (first) handle.setFrame(first);
    handle.setAim(null);
    handle.setAirstrike(null);
    handle.setFocus({ mode: "action" });
    handle.setTicker((dt) => {
      elapsed += dt;
      const cursor = replayCursor(elapsed, data.frames.length);
      for (let i = emitted + 1; i <= cursor.index; i++) {
        handle.emit(data.events[i] ?? []);
        const frameTime = (i * 1000) / 60;
        if (elapsed - frameTime < SOUND_WINDOW_MS) {
          for (const sound of data.sounds[i] ?? []) sounds.play(sound);
        }
      }
      emitted = Math.max(emitted, cursor.index);
      const a = data.frames[cursor.index];
      const b = data.frames[cursor.index + 1] ?? a;
      if (a && b) handle.setFrame(interpolateFrame(a, b, cursor.t, ctx.width));
      if (cursor.done) {
        handle.setTicker(null);
        setDone(round);
      }
    });
    return () => handle.setTicker(null);
  });

  useEffect(() => {
    if (!active) return;
    if (scene.failed) {
      setDone(round);
      return;
    }
    if (!scene.handle) return;
    return start(scene.handle);
  }, [active, scene.handle, scene.failed, round]);

  return { active, round, skip: finish };
}

export function useSceneSync(input: {
  scene: SceneState;
  state: TankArenaState;
  ctx: SceneContext;
  mode: BoardMode;
  localRole: string | null;
  replayActive: boolean;
  reducedMotion: boolean;
  aims: ReadonlyMap<string, number>;
  preview: AimPreview | null;
}) {
  const { scene, state, ctx, mode, localRole, replayActive, aims, preview } =
    input;
  const handle = scene.handle;
  const modules = state.modules;

  useEffect(() => {
    if (!handle) return;
    const arena = buildArena(modules);
    handle.setLayout({
      width: arena.width,
      waterY: arena.waterY,
      boxes: arena.boxes,
    });
  }, [handle, modules]);

  useEffect(() => {
    handle?.setReducedMotion(input.reducedMotion);
  }, [handle, input.reducedMotion]);

  useEffect(() => {
    if (!handle || replayActive) return;
    handle.setFrame(stateScene(state, ctx, aims));
  }, [handle, replayActive, state, ctx, aims]);

  useEffect(() => {
    if (!handle || replayActive) return;
    handle.setAim(preview);
  }, [handle, replayActive, preview]);

  const strike = airstrikeWarning(state);
  const strikeKey = strike ? strike.columns.join(",") : "";
  useEffect(() => {
    if (!handle || replayActive) return;
    handle.setAirstrike(strikeKey ? strikeKey.split(",").map(Number) : null);
  }, [handle, replayActive, strikeKey]);

  const focus: CameraFocus =
    replayActive || mode === "spectate" || mode === "finished"
      ? { mode: "action" }
      : localRole && (mode === "plan" || mode === "locked")
        ? { mode: "tank", role: localRole }
        : { mode: "overview" };
  const focusKey = focus.mode === "tank" ? `tank:${focus.role}` : focus.mode;
  useEffect(() => {
    if (!handle) return;
    if (focusKey.startsWith("tank:")) {
      handle.setFocus({ mode: "tank", role: focusKey.slice(5) });
    } else {
      handle.setFocus({ mode: focusKey as "action" | "overview" });
    }
  }, [handle, focusKey]);
}

export function useAims(
  state: TankArenaState,
  localRole: string | null,
  mode: BoardMode,
  aim: Aim,
) {
  const resolution = state.resolution;
  const showLocal = mode === "plan" || mode === "locked";
  return useMemo(() => {
    const aims = new Map<string, number>();
    if (resolution) {
      for (const [role, plan] of Object.entries(resolution.plans)) {
        aims.set(role, plan.angle);
      }
    }
    if (localRole && showLocal) aims.set(localRole, aim.angle);
    return aims;
  }, [resolution, localRole, showLocal, aim.angle]);
}

export function usePendingLock(round: number, confirmed: boolean) {
  const [pending, setPending] = useState<number | null>(null);
  const isPending = pending === round && !confirmed;
  useEffect(() => {
    if (!isPending) return;
    const id = window.setTimeout(() => setPending(null), LOCK_RETRY_MS);
    return () => window.clearTimeout(id);
  }, [isPending]);
  return {
    pending: isPending,
    markPending: () => setPending(round),
  };
}

export function useAirstrikeSiren(
  state: TankArenaState,
  replayActive: boolean,
  sounds: TankAudio,
) {
  const strike = airstrikeWarning(state);
  const strikeRound = strike?.round ?? null;
  const played = useRef<number | null>(null);
  useEffect(() => {
    if (replayActive || strikeRound === null) return;
    if (played.current === strikeRound) return;
    played.current = strikeRound;
    sounds.play("siren");
  }, [replayActive, strikeRound, sounds]);
}

export function useElementHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setHeight(Math.round(element.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
