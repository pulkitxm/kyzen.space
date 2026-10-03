import { describe, expect, mock, test } from "bun:test";
import { tankArenaEngine } from "@kyzen/games-core";
import type { GameJson, Seat, TankArenaState } from "@kyzen/shared/types";
import { renderToStaticMarkup } from "react-dom/server";

const mounted: string[] = [];

mock.module("../src/games/tank-arena/scene", () => ({
  mountArena: () => {
    mounted.push("arena");
    return null;
  },
  mountPreview: () => {
    mounted.push("preview");
    return null;
  },
}));

const { TankArenaBoard } = await import("../src/games/tank-arena/client");
const { settleReplay } = await import("../src/games/tank-arena/hooks");
const { TankArenaSkeleton } = await import("../src/games/tank-arena/skeleton");

function apply(state: TankArenaState, role: string, move: unknown) {
  const result = tankArenaEngine.reduce?.(state, { role }, move as never);
  if (!result?.ok) throw new Error(result ? result.error : "no reduce");
  return result.state;
}

function seats(count: number): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    role: `p${i + 1}`,
    team: `p${i + 1}`,
    bot: i === 0 ? null : "normal",
  }));
}

function fresh(count = 2) {
  return tankArenaEngine.createInitialState(seats(count), {
    config: { mode: "ffa" },
    seed: 31,
  });
}

function planning(count = 2) {
  let state = fresh(count);
  for (let i = 0; i < count; i++) {
    state = apply(state, `p${i + 1}`, {
      type: "select",
      round: 0,
      tank: i % 2 === 0 ? "bastion" : "kestrel",
    });
  }
  return state;
}

function lockAll(
  state: TankArenaState,
  overrides: Record<string, unknown> = {},
) {
  let next = state;
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    next = apply(
      next,
      tank.role,
      overrides[tank.role] ?? {
        type: "lock",
        round: state.round,
        action: "idle",
        angle: 90,
        power: 0.5,
      },
    );
  }
  return next;
}

function render(
  state: TankArenaState,
  options: {
    viewer?: string;
    deadline?: number | null;
    status?: string;
    connected?: boolean;
  } = {},
) {
  const game = {
    id: "ABC123",
    gameType: "tank-arena",
    status: options.status ?? "active",
    winner: null,
    players: state.seats.map((seat, i) => ({
      userId: i === 0 ? "u1" : `bot:${i}`,
      username: i === 0 ? "alpha" : `Bot ${i + 1}`,
      role: seat.role,
    })),
    gameState: tankArenaEngine.publicState?.(state) ?? state,
    turnDeadline:
      options.deadline === undefined ? Date.now() + 20_000 : options.deadline,
    viewerId: options.viewer ?? "u1",
  } as unknown as GameJson;
  return renderToStaticMarkup(
    <TankArenaBoard
      game={game}
      moves={[]}
      userId={options.viewer ?? "u1"}
      connected={options.connected ?? true}
      makeMove={() => {}}
    />,
  );
}

function roundTime(state: TankArenaState) {
  return tankArenaEngine.roundTimeMs?.(state) ?? 0;
}

describe("TankArenaBoard", () => {
  test("tank select shows both tanks with stats, abilities, and pick status", () => {
    const html = render(fresh(2));
    expect(html).toContain("Choose your tank");
    expect(html).toContain("Bastion");
    expect(html).toContain("Kestrel");
    expect(html).toContain("Siege Mortar");
    expect(html).toContain("Thruster Leap");
    expect(html).toContain("Accuracy");
    expect(html).toContain("Confirm Bastion");
    expect(html).toContain("0 of 2 ready");
    expect(html).toContain("rotating preview");
    expect(html).toContain('data-mode="select"');
  });

  test("a submitted pick is shown as locked for everyone", () => {
    const picked = apply(fresh(2), "p1", {
      type: "select",
      round: 0,
      tank: "kestrel",
    });
    const html = render(picked);
    expect(html).toContain("Locked in");
    expect(html).toContain("1 of 2 ready");
    expect(html).not.toContain("Confirm Bastion");
  });

  test("planning shows the action bar, lock button, roster, and nameplates", () => {
    const html = render(planning(2));
    expect(html).toContain('data-mode="plan"');
    expect(html).toContain("Round 1");
    for (const label of [
      "Missile",
      "Jump",
      "Shield",
      "Siege Mortar",
      "Bulwark Wall",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Lock in");
    expect(html).toContain('aria-keyshortcuts="Enter"');
    expect(html).toContain('data-plate="p1"');
    expect(html).toContain('data-plate="p2"');
    expect(html).toContain("alpha (you)");
    expect(html).toContain("Leave match");
    expect(html).toContain("Drag from your tank to aim");
  });

  test("locked players see the locked badge and a disabled lock button", () => {
    const state = planning(2);
    const locked = apply(state, "p1", {
      type: "lock",
      round: state.round,
      action: "missile",
      angle: 40,
      power: 0.6,
    });
    const html = render(locked);
    expect(html).toContain('data-mode="locked"');
    expect(html).toContain("Locked in. 1 of 2 ready.");
    expect(html).toContain("alpha is locked in");
    expect(html).toContain("Bot 2 is planning");
    expect(html).toContain("Leave match");
  });

  test("leaving is offered during tank select too", () => {
    expect(render(fresh(2))).toContain("Leave match");
    const picked = apply(fresh(2), "p1", {
      type: "select",
      round: 0,
      tank: "bastion",
    });
    expect(render(picked)).toContain("Leave match");
    expect(render(fresh(2), { viewer: "someone-else" })).not.toContain(
      "Leave match",
    );
  });

  test("locking waits for the connection instead of dropping the move", () => {
    const html = render(planning(2), { connected: false });
    expect(html).toContain("Reconnecting...");
    expect(html).not.toContain("Lock in");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-keyshortcuts="Enter"/,
    );
  });

  test("tank picks wait for the connection", () => {
    const html = render(fresh(2), { connected: false });
    expect(html).toContain("Reconnecting...");
    expect(html).not.toContain("Confirm Bastion");
  });

  test("large matches keep the pick list compact and colors distinct", () => {
    const html = render(fresh(25));
    expect(html).toContain("Pick status, 0 of 25 picked");
    expect(html).toContain("max-h-16");
    const swatches = [
      ...html.matchAll(
        /size-2 rounded-full" style="background-color:(#[0-9a-f]{6})/g,
      ),
    ].map((match) => match[1]);
    expect(swatches.length).toBe(25);
    expect(new Set(swatches).size).toBe(25);
  });

  test("a fresh resolution plays as a replay with a skip control", () => {
    const resolved = lockAll(planning(2), {
      p1: { type: "lock", round: 1, action: "missile", angle: 30, power: 0.8 },
    });
    const html = render(resolved, {
      deadline: Date.now() + roundTime(resolved) - 100,
    });
    expect(html).toContain('data-mode="replay"');
    expect(html).toContain("Round 1 in motion");
    expect(html).toContain("Skip");
    expect(html).not.toContain("Lock in");
  });

  test("the replay shows the replayed round, not the next round's locks", () => {
    const resolved = lockAll(planning(2));
    const next = apply(resolved, "p2", {
      type: "lock",
      round: resolved.round,
      action: "idle",
      angle: 90,
      power: 0.5,
    });
    const html = render(next, {
      deadline: Date.now() + roundTime(next) - 100,
    });
    expect(html).toContain('data-mode="replay"');
    expect(html).toContain("Round 1");
    expect(html).not.toContain("Round 2");
    expect(html).toContain("2 of 2 players locked in");
    expect(html).toContain("alpha is locked in");
  });

  test("a fresh resolution without a deadline waits instead of being skipped", () => {
    const resolved = lockAll(planning(2));
    const html = render(resolved, { deadline: null });
    expect(html).toContain('data-mode="replay"');
    expect(html).toContain("Round 1 in motion");
    expect(settleReplay(resolved, null, true, Date.now())).toEqual({
      decided: false,
      done: null,
    });
    const opened = Date.now() - 100;
    expect(
      settleReplay(resolved, opened + roundTime(resolved), true, Date.now()),
    ).toEqual({ decided: true, done: null });
    expect(settleReplay(resolved, Date.now() + 1000, true, Date.now())).toEqual(
      { decided: true, done: resolved.resolution?.round ?? -1 },
    );
    expect(settleReplay(resolved, null, false, Date.now())).toEqual({
      decided: true,
      done: resolved.resolution?.round ?? -1,
    });
  });

  test("an old resolution is not replayed after a reload", () => {
    const resolved = lockAll(planning(2));
    const html = render(resolved, { deadline: Date.now() + 1000 });
    expect(html).toContain('data-mode="plan"');
    expect(html).toContain("Round 2");
  });

  test("an eliminated player becomes a spectator", () => {
    const state = planning(3);
    const out = lockAll(state, { p1: { type: "forfeit", round: state.round } });
    expect(out.tanks[0]?.alive).toBe(false);
    const html = render(out, { deadline: Date.now() + 1000 });
    expect(html).toContain('data-mode="spectate"');
    expect(html).toContain(
      "Your tank is out. Spectating the rest of the match.",
    );
    expect(html).not.toContain("Lock in");
  });

  test("viewers without a seat spectate", () => {
    const html = render(planning(2), { viewer: "someone-else" });
    expect(html).toContain('data-mode="spectate"');
    expect(html).toContain("Spectating");
  });

  test("an announced airstrike shows the warning banner", () => {
    const state = planning(2);
    const html = render({
      ...state,
      airstrike: { round: state.round, columns: [8, 40] },
    });
    expect(html).toContain("Airstrike lands after this round");
  });

  test("finished matches leave the result to the shell overlay", () => {
    const state = planning(2);
    const html = render(
      {
        ...state,
        phase: "finished",
        outcome: { winnerRoles: ["p1"], draw: false },
      },
      { status: "completed", deadline: null },
    );
    expect(html).toContain('data-mode="finished"');
    expect(html).not.toContain("Lock in");
  });

  test("unreadable state renders an alert instead of crashing", () => {
    const html = renderToStaticMarkup(
      <TankArenaBoard
        game={
          {
            id: "X",
            gameType: "tank-arena",
            status: "active",
            winner: null,
            players: [],
            gameState: { nope: true },
          } as unknown as GameJson
        }
        moves={[]}
        userId={null}
        connected={false}
        makeMove={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
  });

  test("server rendering never mounts the WebGL scene", () => {
    render(planning(2));
    expect(mounted).toEqual([]);
  });
});

describe("TankArenaSkeleton", () => {
  test("renders a pulsing arena placeholder with five action slots", () => {
    const html = renderToStaticMarkup(<TankArenaSkeleton />);
    expect(html).toContain('aria-hidden="true"');
    expect((html.match(/size-14/g) ?? []).length).toBe(5);
    expect(html).toContain("animate-pulse");
  });
});
