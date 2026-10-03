import { describe, expect, test } from "bun:test";
import {
  abortWinners,
  decideTimeout,
  TurnTimerManager,
  turnLimitMs,
} from "../src/realtime/turn-timer";

describe("turnLimitMs", () => {
  test("first turn is 30s regardless of strikes", () => {
    expect(turnLimitMs({ isFirstTurn: true, strikes: 0 })).toBe(30_000);
    expect(turnLimitMs({ isFirstTurn: true, strikes: 2 })).toBe(30_000);
  });

  test("later turns are 30s minus 5s per strike, floored at 10s", () => {
    expect(turnLimitMs({ isFirstTurn: false, strikes: 0 })).toBe(30_000);
    expect(turnLimitMs({ isFirstTurn: false, strikes: 1 })).toBe(25_000);
    expect(turnLimitMs({ isFirstTurn: false, strikes: 2 })).toBe(20_000);
    expect(turnLimitMs({ isFirstTurn: false, strikes: 9 })).toBe(10_000);
  });
});

describe("decideTimeout", () => {
  test("escalates 30 -> 25 -> 20 -> abort across consecutive timeouts", () => {
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

describe("abortWinners", () => {
  const players = [
    { userId: "u1", role: "X" },
    { userId: "u2", role: "O" },
  ];

  test("a responding opponent wins by forfeit", () => {
    expect(abortWinners(players, "X", () => 0)).toEqual(["u2"]);
  });

  test("a mutually AFK game has no winner", () => {
    expect(
      abortWinners(players, "X", (role) => (role === "O" ? 1 : 2)),
    ).toEqual([]);
  });

  test("every attentive player wins when one of many is absent", () => {
    const many = [...players, { userId: "u3", role: "Z" }];
    expect(abortWinners(many, "X", (role) => (role === "Z" ? 1 : 0))).toEqual([
      "u2",
    ]);
    expect(abortWinners(many, "X", () => 0)).toEqual(["u2", "u3"]);
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
    m.arm(
      "g1",
      "turn:a",
      turnLimitMs({ isFirstTurn: true, strikes: 0 }),
      () => {},
      "X",
    );
    expect(m.isFirstTurn("g1", "X")).toBe(false);
    expect(m.deadline("g1")).toBe(1_000_000 + 30_000);
    expect(m.armedKey("g1")).toBe("turn:a");
  });

  test("a round clock records its key without consuming any seat's first turn", () => {
    const { deps, count } = fakeDeps();
    const m = new TurnTimerManager(deps);
    m.arm("g1", "round:1", 45_000, () => {});
    expect(m.armedKey("g1")).toBe("round:1");
    expect(m.isFirstTurn("g1", "X")).toBe(true);
    m.arm("g1", "round:2", 20_000, () => {});
    expect(m.armedKey("g1")).toBe("round:2");
    expect(m.deadline("g1")).toBe(1_000_000 + 20_000);
    expect(count()).toBe(2);
  });

  test("clearing keeps the armed key but drops the deadline", () => {
    const { deps } = fakeDeps();
    const m = new TurnTimerManager(deps);
    m.arm("g1", "round:3", 10_000, () => {});
    m.clear("g1");
    expect(m.deadline("g1")).toBeNull();
    expect(m.armedKey("g1")).toBe("round:3");
    m.dispose("g1");
    expect(m.armedKey("g1")).toBeNull();
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
    m.arm(
      "g1",
      "turn:a",
      30_000,
      () => {
        fires++;
      },
      "X",
    );
    m.clear("g1");
    expect(m.deadline("g1")).toBeNull();
    expect(fires).toBe(0);
  });
});
