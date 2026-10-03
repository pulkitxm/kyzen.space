import {
  type Frame,
  MODULE_WIDTH,
  resolutionInput,
  type SimEvent,
  STEPS_PER_SECOND,
  shieldRadius,
  simulateRound,
  TANKS,
  WATER_Y,
} from "@kyzen/games-core";
import type {
  GameJson,
  TankArenaMine,
  TankArenaPickup,
  TankArenaState,
  TankArenaTank,
  TankKind,
} from "@kyzen/shared/types";
import { teamColors } from "./model";
import type {
  SceneEvent,
  SceneFrame,
  SceneProjectile,
  SceneTank,
} from "./view";

export type SoundName =
  | "fire"
  | "explode"
  | "jump"
  | "land"
  | "shield"
  | "wall"
  | "cluster"
  | "mine"
  | "pickup"
  | "portal"
  | "lock"
  | "tick"
  | "siren"
  | "splash"
  | "select";

export type SceneContext = {
  width: number;
  localRole: string | null;
  colors: Map<string, number>;
  names: Map<string, string>;
  kinds: Map<string, TankKind | null>;
};

export type Replay = {
  round: number;
  frames: SceneFrame[];
  events: SceneEvent[][];
  sounds: SoundName[][];
  durationMs: number;
};

const PROJECTILE_TINT = {
  missile: 0xffe1b0,
  shell: 0xffb070,
  rocket: 0xd0b4ff,
  bomblet: 0xfff0a0,
  bomb: 0xff7040,
} as const;

export function sceneContext(
  state: TankArenaState,
  players: GameJson["players"],
  localRole: string | null,
  pickedKind: TankKind | null = null,
): SceneContext {
  const colors = teamColors(state);
  const usernames = new Map(players.map((p) => [p.role, p.username]));
  const names = new Map<string, string>();
  const kinds = new Map<string, TankKind | null>();
  for (const tank of state.tanks) {
    names.set(tank.role, usernames.get(tank.role) ?? tank.role.toUpperCase());
    kinds.set(
      tank.role,
      tank.kind ?? (tank.role === localRole ? pickedKind : null),
    );
  }
  return {
    width: state.modules * MODULE_WIDTH,
    localRole,
    colors,
    names,
    kinds,
  };
}

function sceneTank(
  ctx: SceneContext,
  role: string,
  values: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    hp: number;
    alive: boolean;
    shield: number;
    aim: number;
    leaping: boolean;
  },
): SceneTank {
  const kind = ctx.kinds.get(role) ?? null;
  const spec = kind ? TANKS[kind] : TANKS.bastion;
  return {
    role,
    name: ctx.names.get(role) ?? role,
    kind,
    color: ctx.colors.get(role) ?? 0xffffff,
    x: values.x,
    y: values.y - spec.halfHeight,
    vx: values.vx,
    vy: values.vy,
    halfWidth: spec.halfWidth,
    height: spec.halfHeight * 2,
    hp: values.hp,
    maxHp: spec.maxHp,
    alive: values.alive,
    aim: values.aim,
    shield: values.shield > 0 && kind ? shieldRadius(kind) : 0,
    leaping: values.leaping,
    local: role === ctx.localRole,
  };
}

export function stateScene(
  snapshot: {
    tanks: readonly TankArenaTank[];
    pickups: readonly TankArenaPickup[];
    mines: readonly TankArenaMine[];
  },
  ctx: SceneContext,
  aims: ReadonlyMap<string, number>,
): SceneFrame {
  return {
    tanks: snapshot.tanks.map((tank) =>
      sceneTank(ctx, tank.role, {
        x: tank.x,
        y: tank.y,
        vx: 0,
        vy: 0,
        hp: tank.hp,
        alive: tank.alive && ctx.kinds.get(tank.role) != null,
        shield: 0,
        aim: aims.get(tank.role) ?? defaultFacing(tank.x, ctx.width),
        leaping: false,
      }),
    ),
    projectiles: [],
    walls: [],
    pickups: snapshot.pickups.map((pickup) => ({
      id: `${pickup.id}`,
      kind: pickup.kind,
      x: pickup.x,
      y: pickup.y,
    })),
    mines: snapshot.mines.map((mine) => ({
      id: `${mine.id}`,
      x: mine.x,
      y: mine.y,
    })),
  };
}

function defaultFacing(x: number, width: number) {
  return x < width / 2 ? 30 : 150;
}

function frameScene(
  frame: Frame,
  ctx: SceneContext,
  leaping: ReadonlySet<string>,
  aims: ReadonlyMap<string, number>,
): SceneFrame {
  return {
    tanks: frame.tanks.map((tank) =>
      sceneTank(ctx, tank.role, {
        x: tank.x,
        y: tank.y,
        vx: tank.vx,
        vy: tank.vy,
        hp: tank.hp,
        alive: tank.alive,
        shield: tank.shield,
        aim:
          tank.angle ?? aims.get(tank.role) ?? defaultFacing(tank.x, ctx.width),
        leaping: leaping.has(tank.role),
      }),
    ),
    projectiles: frame.projectiles.map(
      (projectile): SceneProjectile => ({
        id: `${projectile.id}`,
        kind: projectile.kind,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        color:
          projectile.owner !== null
            ? (ctx.colors.get(projectile.owner) ??
              PROJECTILE_TINT[projectile.kind])
            : PROJECTILE_TINT[projectile.kind],
      }),
    ),
    walls: frame.walls.map((wall) => ({
      id: wall.role,
      x0: wall.x0,
      y0: wall.y0,
      x1: wall.x1,
      y1: wall.y1,
      color: ctx.colors.get(wall.role) ?? 0x9fe8ff,
    })),
    pickups: frame.pickups.map((pickup) => ({
      id: `${pickup.id}`,
      kind: pickup.kind,
      x: pickup.x,
      y: pickup.y,
    })),
    mines: frame.mines.map((mine) => ({
      id: `${mine.id}`,
      x: mine.x,
      y: mine.y,
    })),
  };
}

function tankCenters(frame: SceneFrame) {
  return new Map(
    frame.tanks.map((tank) => [
      tank.role,
      { x: tank.x, y: tank.y + tank.height / 2, bottom: tank.y },
    ]),
  );
}

export function sceneEvents(
  events: readonly SimEvent[],
  previous: SceneFrame,
  current: SceneFrame,
  ctx: SceneContext,
): SceneEvent[] {
  if (events.length === 0) return [];
  const before = tankCenters(previous);
  const after = tankCenters(current);
  const pickups = new Map(previous.pickups.map((item) => [item.id, item]));
  const shots = new Map(current.projectiles.map((shot) => [shot.id, shot]));
  const walls = new Map(current.walls.map((wall) => [wall.id, wall]));
  const out: SceneEvent[] = [];
  for (const event of events) {
    switch (event.type) {
      case "fire":
        out.push({ type: "fire", role: event.role, x: event.x, y: event.y });
        break;
      case "explode":
        if (event.cause === "mine") {
          out.push({ type: "mine", x: event.x, y: event.y });
        } else if (event.cause === "selfDestruct") {
          out.push({
            type: "eliminate",
            role: event.owner ?? "",
            x: event.x,
            y: event.y,
          });
        } else {
          out.push({
            type: "explode",
            x: event.x,
            y: event.y,
            radius: event.radius,
          });
        }
        break;
      case "damage":
        out.push({
          type: "damage",
          role: event.role,
          amount: event.amount,
          color: ctx.colors.get(event.role) ?? 0xffffff,
        });
        break;
      case "absorb":
        out.push({ type: "shield", role: event.role });
        break;
      case "reflect":
        out.push({ type: "wall", x: event.x, y: event.y });
        break;
      case "pickup": {
        const at = pickups.get(`${event.id}`) ?? after.get(event.role);
        if (at)
          out.push({ type: "pickup", x: at.x, y: at.y, kind: event.kind });
        break;
      }
      case "wrap": {
        const y =
          event.entity === "tank"
            ? (after.get(String(event.id))?.y ?? 0)
            : (shots.get(`${event.id}`)?.y ?? 0);
        out.push({ type: "portal", y });
        break;
      }
      case "splash":
        out.push({ type: "splash", x: event.x });
        break;
      case "land": {
        const center = after.get(event.role);
        if (center) {
          out.push({
            type: "land",
            role: event.role,
            x: center.x,
            y: center.bottom,
          });
        }
        break;
      }
      case "jump":
      case "leap": {
        const center = before.get(event.role) ?? after.get(event.role);
        if (center) {
          out.push({
            type: event.type,
            role: event.role,
            x: center.x,
            y: center.bottom,
          });
        }
        break;
      }
      case "shield":
        out.push({ type: "shield", role: event.role });
        break;
      case "wall": {
        const wall = walls.get(event.role);
        if (wall) {
          out.push({
            type: "wall",
            x: (wall.x0 + wall.x1) / 2,
            y: (wall.y0 + wall.y1) / 2,
          });
        }
        break;
      }
      case "split":
        out.push({ type: "split", x: event.x, y: event.y });
        break;
      case "selfDestruct":
      case "mine":
      case "airstrike":
        break;
    }
  }
  return out;
}

export function projectileSplashes(
  previous: SceneFrame,
  current: SceneFrame,
): SceneEvent[] {
  const remaining = new Set(current.projectiles.map((shot) => shot.id));
  const out: SceneEvent[] = [];
  for (const shot of previous.projectiles) {
    if (remaining.has(shot.id)) continue;
    if (shot.y + shot.vy / 60 <= WATER_Y + 0.5) {
      out.push({ type: "splash", x: shot.x });
    }
  }
  return out;
}

const EVENT_SOUNDS: Partial<Record<SimEvent["type"], SoundName>> = {
  fire: "fire",
  explode: "explode",
  jump: "jump",
  leap: "jump",
  land: "land",
  shield: "shield",
  wall: "wall",
  reflect: "wall",
  split: "cluster",
  mine: "mine",
  pickup: "pickup",
  wrap: "portal",
  splash: "splash",
  airstrike: "siren",
};

export function eventSounds(events: readonly SimEvent[]): SoundName[] {
  const unique = new Set<SoundName>();
  for (const event of events) {
    const sound = EVENT_SOUNDS[event.type];
    if (sound) unique.add(sound);
  }
  const sounds = [...unique];
  if (unique.has("mine")) {
    const index = sounds.indexOf("explode");
    if (index >= 0) sounds.splice(index, 1);
  }
  return sounds;
}

export function replayDurationMs(frameCount: number) {
  return Math.round((frameCount * 1000) / STEPS_PER_SECOND);
}

export function buildReplay(
  state: TankArenaState,
  ctx: SceneContext,
  aims: ReadonlyMap<string, number>,
): Replay | null {
  const input = resolutionInput(state);
  const resolution = state.resolution;
  if (!input || !resolution) return null;
  const before = stateScene(resolution.before, ctx, aims);
  const frames: SceneFrame[] = [before];
  const events: SceneEvent[][] = [[]];
  const sounds: SoundName[][] = [[]];
  const leaping = new Set<string>();
  simulateRound(input, (frame) => {
    for (const event of frame.events) {
      if (event.type === "leap") leaping.add(event.role);
      if (event.type === "land" || event.type === "splash")
        leaping.delete(event.role);
    }
    const scene = frameScene(frame, ctx, leaping, aims);
    const previous = frames[frames.length - 1] ?? before;
    const splashes = projectileSplashes(previous, scene);
    events.push([
      ...sceneEvents(frame.events, previous, scene, ctx),
      ...splashes,
    ]);
    const frameSounds = eventSounds(frame.events);
    if (splashes.length > 0 && !frameSounds.includes("splash")) {
      frameSounds.push("splash");
    }
    sounds.push(frameSounds);
    frames.push(scene);
  });
  return {
    round: resolution.round,
    frames,
    events,
    sounds,
    durationMs: replayDurationMs(frames.length - 1),
  };
}

export function replayCursor(elapsedMs: number, frameCount: number) {
  const last = Math.max(0, frameCount - 1);
  const position = Math.max(0, (elapsedMs * STEPS_PER_SECOND) / 1000);
  if (position >= last) return { index: last, t: 0, done: true };
  const index = Math.floor(position);
  return { index, t: position - index, done: false };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpWrapped(a: number, b: number, t: number, width: number) {
  if (Math.abs(b - a) > width / 2) return t < 0.5 ? a : b;
  return lerp(a, b, t);
}

export function interpolateFrame(
  a: SceneFrame,
  b: SceneFrame,
  t: number,
  width: number,
): SceneFrame {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const fromTanks = new Map(a.tanks.map((tank) => [tank.role, tank]));
  const fromShots = new Map(a.projectiles.map((shot) => [shot.id, shot]));
  return {
    ...b,
    tanks: b.tanks.map((tank) => {
      const from = fromTanks.get(tank.role);
      if (!from?.alive || !tank.alive) return tank;
      return {
        ...tank,
        x: lerpWrapped(from.x, tank.x, t, width),
        y: lerp(from.y, tank.y, t),
        vx: lerp(from.vx, tank.vx, t),
        vy: lerp(from.vy, tank.vy, t),
      };
    }),
    projectiles: b.projectiles.map((shot) => {
      const from = fromShots.get(shot.id);
      if (!from) return shot;
      return {
        ...shot,
        x: lerpWrapped(from.x, shot.x, t, width),
        y: lerp(from.y, shot.y, t),
      };
    }),
  };
}

const SOUND_WINDOW_MS = 300;

export type ReplaySink = {
  frame: (frame: SceneFrame) => void;
  events: (events: SceneEvent[]) => void;
  sound: (sound: SoundName) => void;
  done: () => void;
};

export function replayPlayer(
  data: Pick<Replay, "frames" | "events" | "sounds">,
  startMs: number,
  width: number,
  sink: ReplaySink,
) {
  const count = data.frames.length;
  let elapsed = Math.max(0, startMs);
  let emitted = replayCursor(elapsed, count).index;
  let finished = false;

  const show = (cursor: ReturnType<typeof replayCursor>) => {
    const a = data.frames[cursor.index];
    const b = data.frames[cursor.index + 1] ?? a;
    if (a && b) sink.frame(interpolateFrame(a, b, cursor.t, width));
  };
  show(replayCursor(elapsed, count));

  return {
    advance: (realMs: number) => {
      if (finished) return;
      elapsed += Math.max(0, realMs);
      const cursor = replayCursor(elapsed, count);
      for (let i = emitted + 1; i <= cursor.index; i++) {
        sink.events(data.events[i] ?? []);
        const frameTime = (i * 1000) / STEPS_PER_SECOND;
        if (elapsed - frameTime >= SOUND_WINDOW_MS) continue;
        for (const sound of data.sounds[i] ?? []) sink.sound(sound);
      }
      emitted = Math.max(emitted, cursor.index);
      show(cursor);
      if (cursor.done) {
        finished = true;
        sink.done();
      }
    },
  };
}

export function replayOffset(input: {
  now: number;
  deadline: number | null | undefined;
  roundTimeMs: number;
  durationMs: number;
}): number | null {
  if (input.deadline == null) return null;
  const opened = input.deadline - input.roundTimeMs;
  const elapsed = input.now - opened;
  if (elapsed < 0) return 0;
  if (elapsed >= input.durationMs) return null;
  return elapsed;
}
