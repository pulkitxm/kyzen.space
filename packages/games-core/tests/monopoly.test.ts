import { describe, expect, test } from "bun:test";
import type {
  MonopolyMove,
  MonopolyState,
  Seat,
} from "@gamelobby/shared/types";
import {
  applyAction,
  BOARD_SIZE,
  GO_SALARY,
  JAIL_FINE,
  JAIL_POSITION,
  MAX_JAIL_TURNS,
  monopolyEngine,
} from "../src/games/monopoly";

function twoPlayerSeats(): Seat[] {
  return [{ role: "p1" }, { role: "p2" }];
}

function init(): MonopolyState {
  return monopolyEngine.createInitialState(twoPlayerSeats());
}

function reduce(
  state: MonopolyState,
  role: string,
  move: MonopolyMove,
): { ok: true; state: MonopolyState } | { ok: false; error: string } {
  if (!monopolyEngine.reduce) throw new Error("reduce method not implemented");
  const result = monopolyEngine.reduce(state, { role }, move);
  if (result.ok) return { ok: true, state: result.state };
  return { ok: false, error: result.error };
}

function getPlayer(state: MonopolyState, index: number) {
  const player = state.players[index];
  if (!player) throw new Error(`Player at index ${index} not found`);
  return player;
}

function getTile(state: MonopolyState, index: number) {
  const tile = state.board[index];
  if (!tile) throw new Error(`Tile at index ${index} not found`);
  return tile;
}

function rollDice(
  state: MonopolyState,
  role: string,
  die1: number,
  die2: number,
): MonopolyState {
  const result = reduce(state, role, {
    type: "ROLL_DICE",
    payload: { die1, die2 },
  });
  if (!result.ok) throw new Error(`rollDice failed: ${result.error}`);
  return result.state;
}

describe("monopoly engine: turn/role enforcement", () => {
  test("rejects a move from the wrong player", () => {
    const state = init();
    const result = reduce(state, "p2", {
      type: "ROLL_DICE",
      payload: { die1: 3, die2: 4 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not your turn");
  });

  test("rejects ROLL_DICE when not in WAITING_FOR_ROLL phase", () => {
    let state = init();
    state = rollDice(state, "p1", 1, 2);
    expect(state.turnPhase).not.toBe("WAITING_FOR_ROLL");
    const noRoll = applyAction(state, {
      type: "ROLL_DICE",
      payload: { die1: 1, die2: 1 },
    });
    expect(noRoll).toEqual(state);
  });
});

describe("monopoly engine: movement and GO salary", () => {
  test("player moves and collects $200 when passing GO", () => {
    let state = init();
    const startBalance = getPlayer(state, 0).balance;
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, position: 30 } : p,
      ),
    };
    state = rollDice(state, "p1", 2, 1);
    const player = getPlayer(state, 0);
    expect(player.position).toBe((30 + 3) % BOARD_SIZE);
    expect(player.balance).toBe(startBalance + GO_SALARY);
  });
});

describe("monopoly engine: jail mechanics", () => {
  test("landing on GoToJail sends player to jail", () => {
    let state = init();
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, position: 20 } : p,
      ),
    };
    state = rollDice(state, "p1", 2, 2);
    const player = getPlayer(state, 0);
    expect(player.position).toBe(JAIL_POSITION);
    expect(player.inJail).toBe(true);
  });

  test("three consecutive doubles sends to jail", () => {
    let state = init();
    state = rollDice(state, "p1", 1, 1);
    expect(state.doublesCount).toBe(1);
    while (state.turnPhase === "LANDED") {
      state = applyAction(state, { type: "DECLINE_PURCHASE" });
    }
    if (state.turnPhase === "WAITING_FOR_END_TURN") {
      state = applyAction(state, { type: "END_TURN" });
    }
    if (
      state.turnPhase !== "WAITING_FOR_ROLL" ||
      state.players[state.currentPlayerIndex]?.id !== "p1"
    ) {
      return;
    }
    state = rollDice(state, "p1", 2, 2);
    expect(state.doublesCount).toBe(2);
    while (state.turnPhase === "LANDED") {
      state = applyAction(state, { type: "DECLINE_PURCHASE" });
    }
    if (state.turnPhase === "WAITING_FOR_END_TURN") {
      state = applyAction(state, { type: "END_TURN" });
    }
    if (
      state.turnPhase !== "WAITING_FOR_ROLL" ||
      state.players[state.currentPlayerIndex]?.id !== "p1"
    ) {
      return;
    }
    state = rollDice(state, "p1", 3, 3);
    const player = getPlayer(state, 0);
    expect(player.inJail).toBe(true);
    expect(player.position).toBe(JAIL_POSITION);
    expect(state.doublesCount).toBe(0);
  });

  test("PAY_JAIL_FINE gets player out of jail", () => {
    let state = init();
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: JAIL_POSITION,
              inJail: true,
              jailTurnsUsed: 0,
            }
          : p,
      ),
    };
    const balanceBefore = getPlayer(state, 0).balance;
    const result = reduce(state, "p1", { type: "PAY_JAIL_FINE" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const player = getPlayer(result.state, 0);
      expect(player.inJail).toBe(false);
      expect(player.balance).toBe(balanceBefore - JAIL_FINE);
    }
  });

  test("USE_OUT_OF_JAIL_CARD gets player out of jail", () => {
    let state = init();
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: JAIL_POSITION,
              inJail: true,
              jailTurnsUsed: 0,
              outOfJailCards: 1,
            }
          : p,
      ),
    };
    const result = reduce(state, "p1", { type: "USE_OUT_OF_JAIL_CARD" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const player = getPlayer(result.state, 0);
      expect(player.inJail).toBe(false);
      expect(player.outOfJailCards).toBe(0);
    }
  });

  test("rolling doubles in jail releases the player", () => {
    let state = init();
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: JAIL_POSITION,
              inJail: true,
              jailTurnsUsed: 0,
            }
          : p,
      ),
    };
    state = rollDice(state, "p1", 3, 3);
    const player = getPlayer(state, 0);
    expect(player.inJail).toBe(false);
  });

  test("staying in jail for max turns forces payment", () => {
    let state = init();
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: JAIL_POSITION,
              inJail: true,
              jailTurnsUsed: MAX_JAIL_TURNS - 1,
            }
          : p,
      ),
    };
    const balanceBefore = getPlayer(state, 0).balance;
    state = rollDice(state, "p1", 2, 3);
    const player = getPlayer(state, 0);
    expect(player.inJail).toBe(false);
    expect(player.balance).toBeLessThan(balanceBefore);
  });
});

describe("monopoly engine: property buying", () => {
  test("BUY_PROPERTY succeeds on unowned property", () => {
    let state = init();
    state = rollDice(state, "p1", 1, 2);
    if (state.turnPhase === "LANDED") {
      const position = getPlayer(state, 0).position;
      const tile = getTile(state, position);
      if (
        tile.type === "Property" ||
        tile.type === "Railroad" ||
        tile.type === "Utility"
      ) {
        const balanceBefore = getPlayer(state, 0).balance;
        const price = "price" in tile ? tile.price : 0;
        state = applyAction(state, { type: "BUY_PROPERTY" });
        const player = getPlayer(state, 0);
        expect(player.ownedProperties.some((op) => op.tileId === tile.id)).toBe(
          true,
        );
        expect(player.balance).toBe(balanceBefore - price);
        expect(state.turnPhase).toBe("WAITING_FOR_END_TURN");
      }
    }
  });

  test("BUY_PROPERTY fails when not in LANDED phase", () => {
    const state = init();
    const next = applyAction(state, { type: "BUY_PROPERTY" });
    expect(next).toEqual(state);
  });

  test("DECLINE_PURCHASE moves to WAITING_FOR_END_TURN", () => {
    let state = init();
    state = rollDice(state, "p1", 1, 2);
    if (state.turnPhase === "LANDED") {
      state = applyAction(state, { type: "DECLINE_PURCHASE" });
      expect(state.turnPhase).toBe("WAITING_FOR_END_TURN");
    }
  });
});

describe("monopoly engine: rent payment", () => {
  test("landing on owned property charges rent", () => {
    let state = init();
    const tile = getTile(state, 3);
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              ownedProperties: [
                ...p.ownedProperties,
                { tileId: tile.id, houses: 0, isMortgaged: false },
              ],
            }
          : { ...p, position: 0 },
      ),
      currentPlayerIndex: 1,
      turnPhase: "WAITING_FOR_ROLL" as const,
    };
    const p2BalanceBefore = getPlayer(state, 1).balance;
    const p1BalanceBefore = getPlayer(state, 0).balance;
    state = rollDice(state, "p2", 1, 2);

    const p2 = getPlayer(state, 1);
    expect(p2.position).toBe(3);
    expect(p2.balance).toBeLessThan(p2BalanceBefore);
    expect(getPlayer(state, 0).balance).toBeGreaterThan(p1BalanceBefore);
  });
});

describe("monopoly engine: END_TURN", () => {
  test("END_TURN advances to next player", () => {
    let state = init();
    state = rollDice(state, "p1", 1, 2);
    while (state.turnPhase === "LANDED") {
      state = applyAction(state, { type: "DECLINE_PURCHASE" });
    }
    expect(state.turnPhase).toBe("WAITING_FOR_END_TURN");
    state = applyAction(state, { type: "END_TURN" });
    expect(state.turnPhase).toBe("WAITING_FOR_ROLL");
    expect(state.players[state.currentPlayerIndex]?.id).toBe("p2");
  });

  test("END_TURN rejects when not in WAITING_FOR_END_TURN", () => {
    const state = init();
    expect(state.turnPhase).toBe("WAITING_FOR_ROLL");
    const next = applyAction(state, { type: "END_TURN" });
    expect(next).toEqual(state);
  });
});

describe("monopoly engine: bankruptcy and win", () => {
  test("DECLARE_BANKRUPTCY marks player bankrupt", () => {
    let state = init();
    state = applyAction(state, { type: "DECLARE_BANKRUPTCY" });
    expect(state.players[0]?.isBankrupt).toBe(true);
  });

  test("last player standing wins", () => {
    let state = init();
    state = applyAction(state, { type: "DECLARE_BANKRUPTCY" });
    expect(state.turnPhase).toBe("GAME_OVER");
    expect(state.winnerId).toBe("p2");
  });
});

describe("monopoly engine: post-terminal rejection", () => {
  test("rejects any move after game is over", () => {
    let state = init();
    state = applyAction(state, { type: "DECLARE_BANKRUPTCY" });
    expect(state.turnPhase).toBe("GAME_OVER");

    const result = reduce(state, "p2", {
      type: "ROLL_DICE",
      payload: { die1: 1, die2: 2 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Game is over");
  });
});

describe("monopoly engine: invalid move format", () => {
  test("rejects moves with invalid format", () => {
    const state = init();
    if (!monopolyEngine.reduce)
      throw new Error("reduce method not implemented");
    const result = monopolyEngine.reduce(state, { role: "p1" }, {
      type: "NONSENSE",
    } as unknown as MonopolyMove);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid move format");
  });

  test("rejects unknown player role", () => {
    const state = init();
    const result = reduce(state, "p99", {
      type: "ROLL_DICE",
      payload: { die1: 1, die2: 2 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not your turn");
  });
});

describe("monopoly engine: build and sell houses", () => {
  test("BUILD_HOUSE fails without full monopoly", () => {
    let state = init();
    const tile = getTile(state, 1);
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              ownedProperties: [
                { tileId: tile.id, houses: 0, isMortgaged: false },
              ],
            }
          : p,
      ),
    };
    const next = applyAction(state, {
      type: "BUILD_HOUSE",
      payload: { tileId: tile.id },
    });
    expect(
      next.players[0]?.ownedProperties.find((op) => op.tileId === tile.id)
        ?.houses,
    ).toBe(0);
  });

  test("SELL_HOUSE fails when no houses to sell", () => {
    let state = init();
    const tile = getTile(state, 1);
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              ownedProperties: [
                { tileId: tile.id, houses: 0, isMortgaged: false },
              ],
            }
          : p,
      ),
    };
    const next = applyAction(state, {
      type: "SELL_HOUSE",
      payload: { tileId: tile.id },
    });
    expect(next.players[0]?.balance).toBe(state.players[0]?.balance);
  });
});

describe("monopoly engine: mortgage", () => {
  test("MORTGAGE_PROPERTY increases balance", () => {
    let state = init();
    const tile = getTile(state, 1);
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              ownedProperties: [
                { tileId: tile.id, houses: 0, isMortgaged: false },
              ],
            }
          : p,
      ),
    };
    const balanceBefore = getPlayer(state, 0).balance;
    const next = applyAction(state, {
      type: "MORTGAGE_PROPERTY",
      payload: { tileId: tile.id },
    });
    expect(getPlayer(next, 0).balance).toBeGreaterThan(balanceBefore);
    expect(
      getPlayer(next, 0).ownedProperties.find((op) => op.tileId === tile.id)
        ?.isMortgaged,
    ).toBe(true);
  });

  test("UNMORTGAGE_PROPERTY decreases balance", () => {
    let state = init();
    const tile = getTile(state, 1);
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              ownedProperties: [
                { tileId: tile.id, houses: 0, isMortgaged: true },
              ],
            }
          : p,
      ),
    };
    const balanceBefore = getPlayer(state, 0).balance;
    const next = applyAction(state, {
      type: "UNMORTGAGE_PROPERTY",
      payload: { tileId: tile.id },
    });
    expect(getPlayer(next, 0).balance).toBeLessThan(balanceBefore);
    expect(
      getPlayer(next, 0).ownedProperties.find((op) => op.tileId === tile.id)
        ?.isMortgaged,
    ).toBe(false);
  });
});

describe("monopoly engine: createInitialState", () => {
  test("produces valid initial state", () => {
    const state = init();
    expect(state.players).toHaveLength(2);
    expect(state.board).toHaveLength(BOARD_SIZE);
    expect(state.turnPhase).toBe("WAITING_FOR_ROLL");
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.winnerId).toBeNull();
    expect(state.dice).toEqual([1, 1]);
    expect(state.doublesCount).toBe(0);
    expect(state.chanceDeck.length).toBeGreaterThan(0);
    expect(state.communityDeck.length).toBeGreaterThan(0);
    expect(state.log.length).toBeGreaterThan(0);
    state.players.forEach((p) => {
      expect(p.balance).toBe(1500);
      expect(p.position).toBe(0);
      expect(p.inJail).toBe(false);
      expect(p.isBankrupt).toBe(false);
      expect(p.ownedProperties).toEqual([]);
    });
  });

  test("returns fresh object each call", () => {
    const a = init();
    const b = init();
    expect(a).not.toBe(b);
  });
});

describe("monopoly engine: TIMEOUT_SKIP", () => {
  test("TIMEOUT_SKIP increments consecutiveTimeouts and advances turn", () => {
    let state = init();
    expect(getPlayer(state, 0).consecutiveTimeouts).toBe(0);

    const result = reduce(state, "p1", { type: "TIMEOUT_SKIP" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      state = result.state;
      expect(getPlayer(state, 0).consecutiveTimeouts).toBe(1);
      expect(state.currentPlayerIndex).toBe(1);
      expect(state.turnPhase).toBe("WAITING_FOR_ROLL");
    }
  });

  test("successful move resets consecutiveTimeouts to 0", () => {
    let state = init();
    state.players[0]!.consecutiveTimeouts = 1;

    state = rollDice(state, "p1", 1, 2);
    expect(getPlayer(state, 0).consecutiveTimeouts).toBe(0);
  });

  test("3 consecutive timeouts bankrupts/invalidates the player", () => {
    let state = init();
    
    let result = reduce(state, "p1", { type: "TIMEOUT_SKIP" });
    expect(result.ok).toBe(true);
    state = (result as any).state;
    expect(getPlayer(state, 0).consecutiveTimeouts).toBe(1);
    expect(state.currentPlayerIndex).toBe(1);

    state = rollDice(state, "p2", 1, 2);
    while (state.turnPhase === "LANDED") {
      state = applyAction(state, { type: "DECLINE_PURCHASE" });
    }
    state = applyAction(state, { type: "END_TURN" });
    expect(state.currentPlayerIndex).toBe(0);

    result = reduce(state, "p1", { type: "TIMEOUT_SKIP" });
    expect(result.ok).toBe(true);
    state = (result as any).state;
    expect(getPlayer(state, 0).consecutiveTimeouts).toBe(2);
    expect(state.currentPlayerIndex).toBe(1);

    state = rollDice(state, "p2", 1, 2);
    while (state.turnPhase === "LANDED") {
      state = applyAction(state, { type: "DECLINE_PURCHASE" });
    }
    state = applyAction(state, { type: "END_TURN" });
    expect(state.currentPlayerIndex).toBe(0);

    result = reduce(state, "p1", { type: "TIMEOUT_SKIP" });
    expect(result.ok).toBe(true);
    state = (result as any).state;
    
    expect(getPlayer(state, 0).isBankrupt).toBe(true);
    expect(state.turnPhase).toBe("GAME_OVER");
    expect(state.winnerId).toBe("p2");
  });
});
