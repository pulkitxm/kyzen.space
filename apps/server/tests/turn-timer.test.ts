import { describe, expect, test } from "bun:test";
import {
  abortOutcome,
  decideTimeout,
  TurnTimerManager,
  turnLimitMs,
} from "../src/realtime/turn-timer";

describe("turnLimitMs", () => {
  test("first turn is 15s regardless of strikes", () => {
    expect(turnLimitMs({ isFirstTurn: true, strikes: 0 })).toBe(15_000);
    expect(turnLimitMs({ isFirstTurn: true, strikes: 2 })).toBe(15_000);
  });

  test("later turns are 5s minus 1s per strike, floored at 1s", () => {
    expect(turnLimitMs({ isFirstTurn: false, strikes: 0 })).toBe(5_000);
    expect(turnLimitMs({ isFirstTurn: false, strikes: 1 })).toBe(4_000);
    expect(turnLimitMs({ isFirstTurn: false, strikes: 2 })).toBe(3_000);
    expect(turnLimitMs({ isFirstTurn: false, strikes: 9 })).toBe(1_000);
  });
});

describe("decideTimeout", () => {
  test("escalates 15 -> 4 -> 3 -> abort across consecutive timeouts", () => {
    expect(decideTimeout({ strikes: 0 })).toEqual({
      kind: "auto-move",
      nextStrikes: 1,
    });
    expect(decideTimeout({ strikes: 1 })).toEqual({
      kind: "auto-move",
      nextStrikes: 2,
    });
    expect(decideTimeout({ strikes: 2 })).toEqual({ kind: "abort" });
  });
});

describe("abortOutcome", () => {
  test("a responding opponent wins by forfeit", () => {
    expect(abortOutcome({ opponentStrikes: 0 })).toEqual({
      winner: "opponent",
    });
  });

  test("a mutually AFK game has no winner", () => {
    expect(abortOutcome({ opponentStrikes: 1 })).toEqual({ winner: null });
  });
});

describe("TurnTimerManager", () => {
  function fakeDeps() {
    let time = 1_000_000;
    const fired: Array<() => void> = [];
    return {
      deps: {
        setTimer: (fn: () => void) => {
          fired.push(fn);
          return fired.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => {},
        now: () => time,
      },
      fire: (i = 0) => fired[i]?.(),
      advance: (ms: number) => {
        time += ms;
      },
      count: () => fired.length,
    };
  }

  test("first turn is consumed, then strikes shorten subsequent limits", () => {
    const { deps } = fakeDeps();
    const m = new TurnTimerManager(deps);
    expect(m.isFirstTurn("g1", "X")).toBe(true);
    m.arm("g1", "X", turnLimitMs({ isFirstTurn: true, strikes: 0 }), () => {});
    expect(m.isFirstTurn("g1", "X")).toBe(false);
    expect(m.deadline("g1")).toBe(1_000_000 + 15_000);
  });

  test("strikes accumulate and reset", () => {
    const { deps } = fakeDeps();
    const m = new TurnTimerManager(deps);
    m.setStrikes("g1", "X", 2);
    expect(m.strikes("g1", "X")).toBe(2);
    m.resetStrikes("g1", "X");
    expect(m.strikes("g1", "X")).toBe(0);
  });

  test("arming a new turn clears the old timer and resets deadline", () => {
    const { deps } = fakeDeps();
    const m = new TurnTimerManager(deps);
    let fires = 0;
    m.arm("g1", "X", 15_000, () => {
      fires++;
    });
    m.clear("g1");
    expect(m.deadline("g1")).toBeNull();
    expect(fires).toBe(0);
  });
});
