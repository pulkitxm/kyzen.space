const FIRST_TURN_MS = 30_000;
const BASE_MS = 30_000;
const MIN_MS = 10_000;
const ABORT_AT_STRIKES = 3;

export function turnLimitMs(p: {
  isFirstTurn: boolean;
  strikes: number;
}): number {
  if (p.isFirstTurn) return FIRST_TURN_MS;
  return Math.max(BASE_MS - p.strikes * 5000, MIN_MS);
}

export type TimeoutDecision =
  | { kind: "auto-move"; nextStrikes: number }
  | { kind: "abort" };

export function decideTimeout(p: { strikes: number }): TimeoutDecision {
  const next = p.strikes + 1;
  if (next >= ABORT_AT_STRIKES) return { kind: "abort" };
  return { kind: "auto-move", nextStrikes: next };
}

export function abortWinners(
  players: { userId: string; role: string }[],
  absentRole: string,
  strikesOf: (role: string) => number,
): string[] {
  return players
    .filter((player) => player.role !== absentRole)
    .filter((player) => strikesOf(player.role) === 0)
    .map((player) => player.userId);
}

type TimerHandle = ReturnType<typeof setTimeout>;

type SeatState = { strikes: number; started: boolean };

type GameTimer = {
  handle: TimerHandle | null;
  deadline: number | null;
  key: string | null;
  seats: Map<string, SeatState>;
};

export type TimerDeps = {
  setTimer: (fn: () => void, ms: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
  now: () => number;
};

const defaultDeps: TimerDeps = {
  setTimer: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearTimer: (handle) => clearTimeout(handle),
  now: () => Date.now(),
};

export class TurnTimerManager {
  private readonly games = new Map<string, GameTimer>();
  private readonly deps: TimerDeps;

  constructor(deps: TimerDeps = defaultDeps) {
    this.deps = deps;
  }

  private game(gameId: string): GameTimer {
    let timer = this.games.get(gameId);
    if (!timer) {
      timer = { handle: null, deadline: null, key: null, seats: new Map() };
      this.games.set(gameId, timer);
    }
    return timer;
  }

  private seat(gameId: string, role: string): SeatState {
    const timer = this.game(gameId);
    let seat = timer.seats.get(role);
    if (!seat) {
      seat = { strikes: 0, started: false };
      timer.seats.set(role, seat);
    }
    return seat;
  }

  isFirstTurn(gameId: string, role: string): boolean {
    return !this.seat(gameId, role).started;
  }

  strikes(gameId: string, role: string): number {
    return this.seat(gameId, role).strikes;
  }

  setStrikes(gameId: string, role: string, value: number): void {
    this.seat(gameId, role).strikes = value;
  }

  resetStrikes(gameId: string, role: string): void {
    this.seat(gameId, role).strikes = 0;
  }

  deadline(gameId: string): number | null {
    return this.games.get(gameId)?.deadline ?? null;
  }

  armedKey(gameId: string): string | null {
    return this.games.get(gameId)?.key ?? null;
  }

  arm(
    gameId: string,
    key: string,
    limitMs: number,
    onFire: () => void,
    role?: string,
  ): void {
    const timer = this.game(gameId);
    if (role) this.seat(gameId, role).started = true;
    if (timer.handle) this.deps.clearTimer(timer.handle);
    timer.key = key;
    timer.deadline = this.deps.now() + limitMs;
    timer.handle = this.deps.setTimer(onFire, limitMs);
  }

  clear(gameId: string): void {
    const timer = this.games.get(gameId);
    if (timer?.handle) this.deps.clearTimer(timer.handle);
    if (timer) {
      timer.handle = null;
      timer.deadline = null;
    }
  }

  dispose(gameId: string): void {
    const timer = this.games.get(gameId);
    if (timer?.handle) this.deps.clearTimer(timer.handle);
    this.games.delete(gameId);
  }

  reset(): void {
    for (const timer of this.games.values()) {
      if (timer.handle) this.deps.clearTimer(timer.handle);
    }
    this.games.clear();
  }
}

export const turnTimers = new TurnTimerManager();
