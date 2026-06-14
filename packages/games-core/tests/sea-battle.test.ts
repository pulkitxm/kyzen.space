import { describe, expect, test } from "bun:test";
import type {
  MoveContext,
  SeaBattleMove,
  SeaBattleShip,
  SeaBattleState,
} from "@kyzen/shared/types";
import {
  generateRandomFleet,
  isSeaBattleTerminal,
  seaBattleEngine,
  validateFleet,
} from "../src/index";

const ctxA: MoveContext = { role: "A" };
const ctxB: MoveContext = { role: "B" };

function horizontalShip(
  row: number,
  col: number,
  length: number,
): SeaBattleShip {
  return {
    cells: Array.from({ length }, (_, i) => ({ row, col: col + i })),
  };
}

function legalFleetA(): SeaBattleShip[] {
  return [
    horizontalShip(0, 0, 5),
    horizontalShip(1, 0, 4),
    horizontalShip(2, 0, 3),
    horizontalShip(3, 0, 3),
    horizontalShip(4, 0, 2),
  ];
}

function legalFleetB(): SeaBattleShip[] {
  return [
    horizontalShip(5, 0, 5),
    horizontalShip(6, 0, 4),
    horizontalShip(7, 0, 3),
    horizontalShip(8, 0, 3),
    horizontalShip(9, 0, 2),
  ];
}

function place(
  state: SeaBattleState,
  ctx: MoveContext,
  ships: SeaBattleShip[],
) {
  return seaBattleEngine.reduce?.(state, ctx, { kind: "place", ships });
}

function fire(
  state: SeaBattleState,
  ctx: MoveContext,
  row: number,
  col: number,
) {
  return seaBattleEngine.reduce?.(state, ctx, { kind: "fire", row, col });
}

function bothPlaced(): SeaBattleState {
  let state = seaBattleEngine.createInitialState([
    { role: "A" },
    { role: "B" },
  ]);
  const a = place(state, ctxA, legalFleetA());
  if (!a?.ok) throw new Error("placement A failed");
  state = a.state;
  const b = place(state, ctxB, legalFleetB());
  if (!b?.ok) throw new Error("placement B failed");
  return b.state;
}

describe("sea-battle createInitialState", () => {
  test("returns the expected placement shape", () => {
    const state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    expect(state).toEqual({
      phase: "placement",
      fleets: { A: [], B: [] },
      shots: { A: [], B: [] },
      ready: { A: false, B: false },
      currentTurn: "A",
    });
  });

  test("returns a fresh object each call", () => {
    const a = seaBattleEngine.createInitialState([{ role: "A" }]);
    const b = seaBattleEngine.createInitialState([{ role: "A" }]);
    expect(a).not.toBe(b);
    expect(a.fleets).not.toBe(b.fleets);
  });
});

describe("sea-battle placement legality", () => {
  const fresh = () =>
    seaBattleEngine.createInitialState([{ role: "A" }, { role: "B" }]);

  test("accepts a valid fleet", () => {
    const res = place(fresh(), ctxA, legalFleetA());
    expect(res?.ok).toBe(true);
    if (res?.ok) {
      expect(res.state.ready.A).toBe(true);
      expect(res.state.fleets.A).toHaveLength(5);
      expect(res.state.phase).toBe("placement");
    }
  });

  test("accepts a generateRandomFleet() fleet", () => {
    for (let i = 0; i < 25; i++) {
      const fleet = generateRandomFleet();
      expect(validateFleet(fleet).ok).toBe(true);
      const res = place(fresh(), ctxA, fleet);
      expect(res?.ok).toBe(true);
    }
  });

  test("rejects overlapping ships", () => {
    const fleet = legalFleetA();
    fleet[1] = horizontalShip(0, 0, 4);
    const res = place(fresh(), ctxA, fleet);
    expect(res?.ok).toBe(false);
  });

  test("rejects out-of-bounds ships", () => {
    const fleet = legalFleetA();
    fleet[0] = horizontalShip(0, 7, 5);
    const res = place(fresh(), ctxA, fleet);
    expect(res?.ok).toBe(false);
  });

  test("rejects non-straight ships", () => {
    const fleet = legalFleetA();
    fleet[0] = {
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 0, col: 3 },
        { row: 0, col: 4 },
      ],
    };
    const res = place(fresh(), ctxA, fleet);
    expect(res?.ok).toBe(false);
  });

  test("rejects a wrong fleet composition", () => {
    const res = place(fresh(), ctxA, [horizontalShip(0, 0, 5)]);
    expect(res?.ok).toBe(false);
  });
});

describe("sea-battle phase gating", () => {
  test("rejects fire during placement", () => {
    const fresh = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    const res = fire(fresh, ctxA, 0, 0);
    expect(res?.ok).toBe(false);
  });

  test("rejects place during battle", () => {
    const state = bothPlaced();
    expect(state.phase).toBe("battle");
    const res = place(state, ctxA, legalFleetA());
    expect(res?.ok).toBe(false);
  });

  test("rejects a double-place from a ready player", () => {
    let state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    const a = place(state, ctxA, legalFleetA());
    expect(a?.ok).toBe(true);
    if (!a?.ok) return;
    state = a.state;
    const again = place(state, ctxA, legalFleetA());
    expect(again?.ok).toBe(false);
  });
});

describe("sea-battle simultaneous placement", () => {
  test("either role may place first", () => {
    const fresh = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    expect(place(fresh, ctxA, legalFleetA())?.ok).toBe(true);
    expect(place(fresh, ctxB, legalFleetB())?.ok).toBe(true);
  });

  test("both placing flips phase to battle", () => {
    const state = bothPlaced();
    expect(state.phase).toBe("battle");
    expect(state.ready).toEqual({ A: true, B: true });
    expect(state.currentTurn).toBe("A");
  });

  test("currentRole reflects the next not-ready role in placement", () => {
    let state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    expect(seaBattleEngine.currentRole?.(state)).toBe("A");
    const a = place(state, ctxA, legalFleetA());
    if (!a?.ok) throw new Error("placement failed");
    state = a.state;
    expect(seaBattleEngine.currentRole?.(state)).toBe("B");
  });
});

describe("sea-battle battle resolution", () => {
  test("a hit and a miss are recorded with strict alternation", () => {
    const state = bothPlaced();
    const hit = fire(state, ctxA, 5, 0);
    expect(hit?.ok).toBe(true);
    if (!hit?.ok) return;
    expect(hit.state.shots.B).toEqual([{ row: 5, col: 0, hit: true }]);
    expect(hit.state.currentTurn).toBe("B");

    const miss = fire(hit.state, ctxB, 0, 9);
    expect(miss?.ok).toBe(true);
    if (!miss?.ok) return;
    expect(miss.state.shots.A).toEqual([{ row: 0, col: 9, hit: false }]);
    expect(miss.state.currentTurn).toBe("A");
  });

  test("firing out of turn is rejected", () => {
    const state = bothPlaced();
    expect(fire(state, ctxB, 0, 0)?.ok).toBe(false);
  });

  test("a repeat fire is rejected and does not consume the turn", () => {
    const state = bothPlaced();
    const first = fire(state, ctxA, 5, 0);
    expect(first?.ok).toBe(true);
    if (!first?.ok) return;
    const backToA = fire(first.state, ctxB, 0, 9);
    expect(backToA?.ok).toBe(true);
    if (!backToA?.ok) return;
    expect(backToA.state.currentTurn).toBe("A");
    const repeat = fire(backToA.state, ctxA, 5, 0);
    expect(repeat?.ok).toBe(false);
    expect(backToA.state.currentTurn).toBe("A");
  });
});

describe("sea-battle sink and win", () => {
  const safeMissCells = (() => {
    const cells: { row: number; col: number }[] = [];
    for (let row = 5; row <= 9; row++) {
      for (let col = 0; col <= 9; col++) cells.push({ row, col });
    }
    return cells;
  })();

  test("A wins by sinking every B ship", () => {
    let state = bothPlaced();
    const bCells = legalFleetB().flatMap((ship) => ship.cells);

    let lastOutcome: ReturnType<typeof fire> | undefined;
    let missIndex = 0;
    for (let i = 0; i < bCells.length; i++) {
      const target = bCells[i];
      if (!target) throw new Error("missing target");
      const onLast = i === bCells.length - 1;

      const aRes = fire(state, ctxA, target.row, target.col);
      expect(aRes?.ok).toBe(true);
      if (!aRes?.ok) return;
      lastOutcome = aRes;
      state = aRes.state;

      if (!onLast) {
        const miss = safeMissCells[missIndex++];
        if (!miss) throw new Error("ran out of safe miss cells");
        const bRes = fire(state, ctxB, miss.row, miss.col);
        if (!bRes?.ok) throw new Error("b fire failed");
        state = bRes.state;
      }
    }

    expect(lastOutcome?.ok).toBe(true);
    if (lastOutcome?.ok) {
      expect(lastOutcome.outcome).toEqual({
        status: "completed",
        winnerRole: "A",
        draw: false,
      });
    }
    expect(isSeaBattleTerminal(state)).toBe(true);
  });

  test("a single ship sinks only when all its cells are hit", () => {
    let state = bothPlaced();
    const destroyer = legalFleetB()[4];
    if (!destroyer) throw new Error("missing destroyer");
    const [bow, stern] = destroyer.cells;
    if (!bow || !stern) throw new Error("destroyer is malformed");

    const first = fire(state, ctxA, bow.row, bow.col);
    expect(first?.ok).toBe(true);
    if (!first?.ok) return;
    expect(first.outcome.status).toBe("active");
    state = first.state;

    const bTurn = fire(state, ctxB, 0, 9);
    if (!bTurn?.ok) throw new Error("b fire failed");
    state = bTurn.state;

    const second = fire(state, ctxA, stern.row, stern.col);
    expect(second?.ok).toBe(true);
    if (second?.ok) expect(second.outcome.status).toBe("active");
  });

  test("post-terminal moves are rejected", () => {
    let state = bothPlaced();
    const bCells = legalFleetB().flatMap((ship) => ship.cells);
    let missIndex = 0;
    for (let i = 0; i < bCells.length; i++) {
      const t = bCells[i];
      if (!t) continue;
      const aRes = fire(state, ctxA, t.row, t.col);
      if (!aRes?.ok) throw new Error("fire failed");
      state = aRes.state;
      if (isSeaBattleTerminal(state)) break;
      const miss = safeMissCells[missIndex++];
      if (!miss) throw new Error("ran out of safe miss cells");
      const bRes = fire(state, ctxB, miss.row, miss.col);
      if (!bRes?.ok) throw new Error("b fire failed");
      state = bRes.state;
    }
    expect(isSeaBattleTerminal(state)).toBe(true);
    expect(fire(state, ctxB, 0, 0)?.ok).toBe(false);
    expect(seaBattleEngine.currentRole?.(state)).toBeNull();
  });
});

describe("sea-battle placement composition edges", () => {
  const fresh = () =>
    seaBattleEngine.createInitialState([{ role: "A" }, { role: "B" }]);

  test("rejects the right count but a wrong length multiset", () => {
    const fleet = [
      horizontalShip(0, 0, 5),
      horizontalShip(1, 0, 4),
      horizontalShip(2, 0, 3),
      horizontalShip(3, 0, 2),
      horizontalShip(4, 0, 2),
    ];
    expect(fleet).toHaveLength(5);
    const res = place(fresh(), ctxA, fleet);
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Fleet must match the standard composition");
    }
  });

  test("rejects too few ships", () => {
    const res = place(fresh(), ctxA, legalFleetA().slice(0, 4));
    expect(res?.ok).toBe(false);
  });

  test("rejects too many ships", () => {
    const res = place(fresh(), ctxA, [
      ...legalFleetA(),
      horizontalShip(8, 0, 2),
    ]);
    expect(res?.ok).toBe(false);
  });

  test("surfaces the engine's own composition error string", () => {
    const res = place(fresh(), ctxA, [horizontalShip(0, 0, 5)]);
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Fleet must match the standard composition");
    }
  });

  test("one role placing then the other completing flips to battle with currentTurn A", () => {
    let state = fresh();
    const b = place(state, ctxB, legalFleetB());
    expect(b?.ok).toBe(true);
    if (!b?.ok) return;
    state = b.state;
    expect(state.phase).toBe("placement");
    expect(state.ready).toEqual({ A: false, B: true });
    const a = place(state, ctxA, legalFleetA());
    expect(a?.ok).toBe(true);
    if (!a?.ok) return;
    expect(a.state.phase).toBe("battle");
    expect(a.state.ready).toEqual({ A: true, B: true });
    expect(a.state.currentTurn).toBe("A");
  });
});

describe("sea-battle reduce guard ordering and malformed input", () => {
  test("a malformed move object returns ok:false without mutating the input", () => {
    const state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    const snapshot = JSON.parse(JSON.stringify(state));
    const res = seaBattleEngine.reduce?.(state, ctxA, {
      definitely: "not a move",
    } as unknown as SeaBattleMove);
    expect(res?.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });

  test("an empty move object returns ok:false", () => {
    const state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    const res = seaBattleEngine.reduce?.(
      state,
      ctxA,
      {} as unknown as SeaBattleMove,
    );
    expect(res?.ok).toBe(false);
  });

  test("a non-A/B role is rejected as not a player", () => {
    const state = bothPlaced();
    const res = seaBattleEngine.reduce?.(
      state,
      { role: "spectator" },
      { kind: "fire", row: 5, col: 0 },
    );
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not a player in this game");
  });

  test("the terminal guard precedes the move-schema and role checks", () => {
    let state = bothPlaced();
    const bCells = legalFleetB().flatMap((ship) => ship.cells);
    let missIndex = 0;
    const misses: { row: number; col: number }[] = [];
    for (let row = 5; row <= 9; row++) {
      for (let col = 0; col <= 9; col++) misses.push({ row, col });
    }
    for (let i = 0; i < bCells.length; i++) {
      const t = bCells[i];
      if (!t) continue;
      const aRes = fire(state, ctxA, t.row, t.col);
      if (!aRes?.ok) throw new Error("fire failed");
      state = aRes.state;
      if (isSeaBattleTerminal(state)) break;
      const miss = misses[missIndex++];
      if (!miss) throw new Error("ran out of miss cells");
      const bRes = fire(state, ctxB, miss.row, miss.col);
      if (!bRes?.ok) throw new Error("b fire failed");
      state = bRes.state;
    }
    expect(isSeaBattleTerminal(state)).toBe(true);
    const res = seaBattleEngine.reduce?.(state, ctxA, {
      junk: true,
    } as unknown as SeaBattleMove);
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid move");
  });
});

describe("sea-battle reduce purity", () => {
  test("a place move does not mutate the input fleets/shots arrays", () => {
    const state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    const snapshot = JSON.parse(JSON.stringify(state));
    const res = place(state, ctxA, legalFleetA());
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(state).toEqual(snapshot);
    expect(res.state).not.toBe(state);
    expect(res.state.fleets).not.toBe(state.fleets);
    expect(res.state.shots.A).not.toBe(state.shots.A);
  });

  test("a fire move does not mutate the input nested shot arrays", () => {
    const state = bothPlaced();
    const snapshot = JSON.parse(JSON.stringify(state));
    const res = fire(state, ctxA, 5, 0);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(state).toEqual(snapshot);
    expect(res.state).not.toBe(state);
    expect(res.state.shots).not.toBe(state.shots);
    expect(res.state.shots.B).not.toBe(state.shots.B);
  });
});

describe("sea-battle repeat-fire rejection", () => {
  test("re-firing an already-HIT cell is rejected and keeps the turn", () => {
    const state = bothPlaced();
    const hit = fire(state, ctxA, 5, 0);
    expect(hit?.ok).toBe(true);
    if (!hit?.ok) return;
    expect(hit.state.shots.B[0]?.hit).toBe(true);
    const bTurn = fire(hit.state, ctxB, 0, 9);
    if (!bTurn?.ok) throw new Error("b fire failed");
    const repeat = fire(bTurn.state, ctxA, 5, 0);
    expect(repeat).toBeDefined();
    if (!repeat) return;
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.error).toBe("You already fired at that cell");
    expect(bTurn.state.currentTurn).toBe("A");
  });

  test("re-firing an already-MISSED cell is also rejected", () => {
    const state = bothPlaced();
    const miss = fire(state, ctxA, 9, 9);
    expect(miss?.ok).toBe(true);
    if (!miss?.ok) return;
    expect(miss.state.shots.B[0]?.hit).toBe(false);
    const bTurn = fire(miss.state, ctxB, 0, 9);
    if (!bTurn?.ok) throw new Error("b fire failed");
    const repeat = fire(bTurn.state, ctxA, 9, 9);
    expect(repeat).toBeDefined();
    if (!repeat) return;
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.error).toBe("You already fired at that cell");
  });
});

describe("sea-battle post-win move rejection", () => {
  const allMisses = (() => {
    const cells: { row: number; col: number }[] = [];
    for (let row = 5; row <= 9; row++) {
      for (let col = 0; col <= 9; col++) cells.push({ row, col });
    }
    return cells;
  })();

  function playToWin(): SeaBattleState {
    let state = bothPlaced();
    const bCells = legalFleetB().flatMap((ship) => ship.cells);
    let missIndex = 0;
    for (let i = 0; i < bCells.length; i++) {
      const t = bCells[i];
      if (!t) continue;
      const aRes = fire(state, ctxA, t.row, t.col);
      if (!aRes?.ok) throw new Error("fire failed");
      state = aRes.state;
      if (isSeaBattleTerminal(state)) break;
      const miss = allMisses[missIndex++];
      if (!miss) throw new Error("ran out of miss cells");
      const bRes = fire(state, ctxB, miss.row, miss.col);
      if (!bRes?.ok) throw new Error("b fire failed");
      state = bRes.state;
    }
    return state;
  }

  test("a post-win fire is rejected with Game is over", () => {
    const state = playToWin();
    expect(isSeaBattleTerminal(state)).toBe(true);
    const res = fire(state, ctxB, 0, 0);
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is over");
  });

  test("a post-win place is rejected with Game is over (terminal-before-phase)", () => {
    const state = playToWin();
    const res = place(state, ctxA, legalFleetA());
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is over");
  });

  test("the winning move fires the completed outcome exactly once", () => {
    let state = bothPlaced();
    const bCells = legalFleetB().flatMap((ship) => ship.cells);
    let missIndex = 0;
    let completedCount = 0;
    for (let i = 0; i < bCells.length; i++) {
      const t = bCells[i];
      if (!t) continue;
      const aRes = fire(state, ctxA, t.row, t.col);
      if (!aRes?.ok) throw new Error("fire failed");
      if (aRes.outcome.status === "completed") completedCount++;
      state = aRes.state;
      if (isSeaBattleTerminal(state)) break;
      const miss = allMisses[missIndex++];
      if (!miss) throw new Error("ran out of miss cells");
      const bRes = fire(state, ctxB, miss.row, miss.col);
      if (!bRes?.ok) throw new Error("b fire failed");
      state = bRes.state;
    }
    expect(completedCount).toBe(1);
  });
});

describe("sea-battle autoMove", () => {
  test("placement auto-move yields a legal accepted fleet", () => {
    const state = seaBattleEngine.createInitialState([
      { role: "A" },
      { role: "B" },
    ]);
    const move = seaBattleEngine.autoMove?.(state, "A");
    expect(move?.kind).toBe("place");
    const res = seaBattleEngine.reduce?.(state, ctxA, move as SeaBattleMove);
    expect(res?.ok).toBe(true);
  });

  test("battle auto-move targets an un-fired cell and is accepted", () => {
    let state = bothPlaced();
    const first = fire(state, ctxA, 5, 0);
    if (!first?.ok) throw new Error("fire failed");
    state = first.state;
    const move = seaBattleEngine.autoMove?.(state, "B");
    expect(move?.kind).toBe("fire");
    const res = seaBattleEngine.reduce?.(state, ctxB, move as SeaBattleMove);
    expect(res?.ok).toBe(true);
  });

  test("battle auto-move never targets an already-fired cell on a 99-shot board", () => {
    const state = bothPlaced();
    const shots: { row: number; col: number; hit: boolean }[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if (row === 8 && col === 3) continue;
        shots.push({ row, col, hit: false });
      }
    }
    const nearFull: SeaBattleState = {
      ...state,
      shots: { A: state.shots.A, B: shots },
    };
    const move = seaBattleEngine.autoMove?.(nearFull, "A");
    expect(move).toEqual({ kind: "fire", row: 8, col: 3 });
    const res = seaBattleEngine.reduce?.(nearFull, ctxA, move as SeaBattleMove);
    expect(res?.ok).toBe(true);
  });
});

describe("sea-battle viewFor redaction", () => {
  test("B cannot derive A's un-hit ships", () => {
    const state = bothPlaced();
    const view = seaBattleEngine.viewFor?.(state, "B");
    expect(view).toBeDefined();
    if (!view) return;
    expect(view.fleets.B).toHaveLength(5);
    expect(view.fleets.A).toHaveLength(0);
  });

  test("A's sunk ships become visible to B; un-sunk stay hidden", () => {
    let state = bothPlaced();
    const destroyerA = legalFleetA()[4];
    if (!destroyerA) throw new Error("missing destroyer");
    const [bow, stern] = destroyerA.cells;
    if (!bow || !stern) throw new Error("destroyer is malformed");

    const fireSeq = (
      s: SeaBattleState,
      ctx: MoveContext,
      row: number,
      col: number,
    ) => {
      const r = fire(s, ctx, row, col);
      if (!r?.ok) throw new Error("fire failed");
      return r.state;
    };

    state = fireSeq(state, ctxA, 9, 9);
    state = fireSeq(state, ctxB, bow.row, bow.col);
    state = fireSeq(state, ctxA, 9, 8);
    state = fireSeq(state, ctxB, stern.row, stern.col);

    const view = seaBattleEngine.viewFor?.(state, "B");
    if (!view) throw new Error("no view");
    expect(view.fleets.A).toHaveLength(1);
    expect(view.fleets.A[0]?.cells).toHaveLength(2);
  });

  test("shots are visible to both players", () => {
    let state = bothPlaced();
    const r = fire(state, ctxA, 5, 0);
    if (!r?.ok) throw new Error("fire failed");
    state = r.state;
    const viewA = seaBattleEngine.viewFor?.(state, "A");
    const viewB = seaBattleEngine.viewFor?.(state, "B");
    expect(viewA?.shots.B).toEqual([{ row: 5, col: 0, hit: true }]);
    expect(viewB?.shots.B).toEqual([{ row: 5, col: 0, hit: true }]);
  });

  test("spectator view fogs both fleets", () => {
    const state = bothPlaced();
    const view = seaBattleEngine.viewFor?.(state, "spectator");
    expect(view?.fleets.A).toHaveLength(0);
    expect(view?.fleets.B).toHaveLength(0);
  });

  test("viewFor does not mutate the source state", () => {
    const state = bothPlaced();
    const snapshot = JSON.parse(JSON.stringify(state));
    seaBattleEngine.viewFor?.(state, "B");
    expect(state).toEqual(snapshot);
  });
});
