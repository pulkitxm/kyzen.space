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
  useSyncExternalStore,
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
  replayDurationMs,
  replayOffset,
  replayPlayer,
  type SceneContext,
  stateScene,
} from "./replay";
import type { AimPreview, ArenaHandle, CameraFocus } from "./view";

export type SceneState = { handle: ArenaHandle | null; failed: boolean };

const DOT_SPACING = 0.6;
const MAX_DOTS = 160;
const LOCK_RETRY_MS = 5000;

function roundTimeOf(state: TankArenaState) {
  return tankArenaEngine.roundTimeMs?.(state) ?? 0;
}

export type ReplaySettlement = { decided: boolean; done: number | null };

export function settleReplay(
  state: TankArenaState,
  deadline: number | null,
  live: boolean,
  now: number,
): ReplaySettlement {
  const resolution = state.resolution;
  if (!resolution) return { decided: true, done: null };
  if (deadline === null) {
    return live
      ? { decided: false, done: null }
      : { decided: true, done: resolution.round };
  }
  const offset = replayOffset({
    now,
    deadline,
    roundTimeMs: roundTimeOf(state),
    durationMs: replayDurationMs(resolution.steps),
  });
  return { decided: true, done: offset === null ? resolution.round : null };
}

function planAngles(state: TankArenaState) {
  const aims = new Map<string, number>();
  for (const [role, plan] of Object.entries(state.resolution?.plans ?? {})) {
    aims.set(role, plan.angle);
  }
  return aims;
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

function createRoundStore() {
  let value: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: number | null) => {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useResolutionReplay(input: {
  state: TankArenaState;
  ctx: SceneContext;
  scene: SceneState;
  deadline: number | null;
  live: boolean;
  sounds: TankAudio;
}) {
  const { state, ctx, scene, deadline, live, sounds } = input;
  const round = state.resolution?.round ?? null;
  const [mounted] = useState(() => ({ round, at: Date.now() }));
  const [watchedRound] = useState(createRoundStore);
  const watched = useSyncExternalStore(
    watchedRound.subscribe,
    watchedRound.get,
    watchedRound.get,
  );
  const liveArrival = round !== mounted.round;
  const settled: ReplaySettlement = liveArrival
    ? { decided: true, done: null }
    : settleReplay(state, deadline, live, mounted.at);
  const active =
    round !== null &&
    watched !== round &&
    settled.decided &&
    settled.done !== round &&
    !scene.failed;
  const finish = useCallback(
    () => watchedRound.set(round),
    [watchedRound, round],
  );

  const start = useEffectEvent((handle: ArenaHandle) => {
    const data = buildReplay(state, ctx, planAngles(state));
    if (!data) return;
    const offset = replayOffset({
      now: Date.now(),
      deadline,
      roundTimeMs: roundTimeOf(state),
      durationMs: data.durationMs,
    });
    handle.setAim(null);
    handle.setAirstrike(null);
    handle.setFocus({ mode: "action" });
    const player = replayPlayer(
      data,
      offset ?? (liveArrival ? 0 : data.durationMs),
      ctx.width,
      {
        frame: (frame) => handle.setFrame(frame),
        events: (events) => handle.emit(events),
        sound: (sound) => sounds.play(sound),
        done: () => {
          handle.setTicker(null);
          finish();
        },
      },
    );
    handle.setTicker(player.advance);
    return () => handle.setTicker(null);
  });

  useEffect(() => {
    if (round === null || !active || !scene.handle) return;
    return start(scene.handle);
  }, [round, active, scene.handle]);

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
