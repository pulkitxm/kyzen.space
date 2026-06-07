import { MONOPOLY } from "@gamelobby/shared/constants";
import {
  type GameEngine,
  type MonopolyMove,
  type MonopolyState,
  monopolyMoveSchema,
  type OwnedProperty,
  type Player,
  type PropertyTile,
  type RailroadTile,
  type ReduceResult,
  type Seat,
  type Tile,
  type UtilityTile,
} from "@gamelobby/shared/types";
import {
  BOARD,
  BOARD_SIZE,
  GO_SALARY,
  HOTEL_HOUSES,
  JAIL_FINE,
  JAIL_POSITION,
  MAX_JAIL_TURNS,
  MORTGAGE_RATE,
  TILE_BY_ID,
  UNMORTGAGE_RATE,
} from "./constants/board";
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from "./constants/cards";

function shuffle<T>(
  arr: ReadonlyArray<T>,
  rand: () => number = Math.random,
): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = copy[i];
    if (temp !== undefined) {
      const target = copy[j];
      if (target !== undefined) {
        copy[i] = target;
        copy[j] = temp;
      }
    }
  }
  return copy;
}

function updatePlayer(
  state: MonopolyState,
  playerId: string,
  patch: Partial<Player>,
): MonopolyState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, ...patch } : p,
    ),
  };
}

function addLog(state: MonopolyState, msg: string): MonopolyState {
  return { ...state, log: [...state.log, msg] };
}

function ownerOf(state: MonopolyState, tileId: string): Player | undefined {
  return state.players.find((p) =>
    p.ownedProperties.some((op) => op.tileId === tileId),
  );
}

function getOwnedProp(
  player: Player,
  tileId: string,
): OwnedProperty | undefined {
  return player.ownedProperties.find((op) => op.tileId === tileId);
}

function countGroupOwned(
  state: MonopolyState,
  group: string,
  playerId: string,
): number {
  return BOARD.filter(
    (t) => t.type === "Property" && (t as PropertyTile).group === group,
  ).filter((t) =>
    state.players
      .find((p) => p.id === playerId)
      ?.ownedProperties.some((op) => op.tileId === t.id),
  ).length;
}

function groupSize(group: string): number {
  return BOARD.filter(
    (t) => t.type === "Property" && (t as PropertyTile).group === group,
  ).length;
}

function calcPropertyRent(
  tile: PropertyTile,
  owner: Player,
  state: MonopolyState,
): number {
  const op = getOwnedProp(owner, tile.id);
  if (!op || op.isMortgaged) return 0;
  const houses = op.houses;
  const monopoly =
    countGroupOwned(state, tile.group, owner.id) === groupSize(tile.group);
  if (houses === 0) return monopoly ? tile.rent[0] * 2 : tile.rent[0];
  const value = tile.rent[Math.min(houses, 5)];
  return value !== undefined ? value : 0;
}

function calcRailroadRent(
  tile: RailroadTile,
  owner: Player,
  state: MonopolyState,
): number {
  const op = getOwnedProp(owner, tile.id);
  if (!op || op.isMortgaged) return 0;
  const count = state.players
    .find((p) => p.id === owner.id)
    ?.ownedProperties.filter((op2) => {
      const t = TILE_BY_ID[op2.tileId];
      return t !== undefined && t.type === "Railroad";
    }).length;
  const val = tile.rent[count ?? 0];
  return val !== undefined ? val : 0;
}

function calcUtilityRent(
  owner: Player,
  _state: MonopolyState,
  diceTotal: number,
): number {
  const utilsOwned = owner.ownedProperties.filter((op) => {
    const t = TILE_BY_ID[op.tileId];
    return t !== undefined && t.type === "Utility" && !op.isMortgaged;
  }).length;
  return diceTotal * (utilsOwned === 2 ? 10 : 4);
}

function movePlayerTo(
  state: MonopolyState,
  player: Player,
  newPos: number,
  collectGo = true,
): MonopolyState {
  const passedGo = collectGo && newPos < player.position;
  let next = updatePlayer(state, player.id, {
    position: newPos,
    balance: passedGo ? player.balance + GO_SALARY : player.balance,
  });
  if (passedGo) {
    next = addLog(
      next,
      `${player.name} passed GO and collected $${GO_SALARY}.`,
    );
  }
  return next;
}

function sendToJail(state: MonopolyState, player: Player): MonopolyState {
  let next = updatePlayer(state, player.id, {
    position: JAIL_POSITION,
    inJail: true,
    jailTurnsUsed: 0,
  });
  next = addLog(next, `${player.name} is sent to Jail!`);
  return { ...next, turnPhase: "WAITING_FOR_END_TURN", doublesCount: 0 };
}

function handleLanding(state: MonopolyState, player: Player): MonopolyState {
  const tile = state.board[player.position];
  if (!tile) return state;
  let next = state;

  switch (tile.type) {
    case "Go":
      return addLog(next, `${player.name} landed on GO.`);

    case "GoToJail":
      return sendToJail(next, player);

    case "FreeParking":
    case "Jail":
      return addLog(
        next,
        `${player.name} is just visiting Jail / Free Parking.`,
      );

    case "IncomeTax":
      next = updatePlayer(next, player.id, {
        balance: player.balance - tile.amount,
      });
      return addLog(next, `${player.name} paid Income Tax of $${tile.amount}.`);

    case "LuxuryTax":
      next = updatePlayer(next, player.id, {
        balance: player.balance - tile.amount,
      });
      return addLog(next, `${player.name} paid Luxury Tax of $${tile.amount}.`);

    case "CommunityChest":
    case "Chance":
      return {
        ...addLog(next, `${player.name} landed on ${tile.name}.`),
        turnPhase: "LANDED",
      };

    case "Property":
    case "Railroad":
    case "Utility": {
      const owner = ownerOf(next, tile.id);
      if (!owner) {
        next = addLog(
          next,
          `${player.name} landed on ${tile.name}. No owner — available to buy.`,
        );
        return { ...next, turnPhase: "LANDED" };
      }
      if (owner.id === player.id) {
        return addLog(next, `${player.name} owns ${tile.name}.`);
      }
      const diceTotal = next.dice[0] + next.dice[1];
      let rent = 0;
      if (tile.type === "Property") {
        rent = calcPropertyRent(tile as PropertyTile, owner, next);
      } else if (tile.type === "Railroad") {
        rent = calcRailroadRent(tile as RailroadTile, owner, next);
      } else {
        rent = calcUtilityRent(owner, next, diceTotal);
      }

      next = updatePlayer(next, player.id, { balance: player.balance - rent });
      next = updatePlayer(next, owner.id, { balance: owner.balance + rent });
      return addLog(
        next,
        `${player.name} paid $${rent} rent to ${owner.name} for ${tile.name}.`,
      );
    }

    default:
      return next;
  }
}

function drawCard(
  state: MonopolyState,
  player: Player,
  deckKey: "chanceDeck" | "communityDeck",
): MonopolyState {
  const deck = [...state[deckKey]];
  const [card, ...rest] = deck;
  if (!card) return state;

  let next: MonopolyState = { ...state, [deckKey]: [...rest, card] };
  next = addLog(next, `${player.name} drew: "${card.text}"`);

  const { effect } = card;

  switch (effect.kind) {
    case "COLLECT":
      return updatePlayer(next, player.id, {
        balance: player.balance + effect.amount,
      });

    case "PAY":
      return updatePlayer(next, player.id, {
        balance: player.balance - effect.amount,
      });

    case "MOVE_TO": {
      const pos = effect.position;
      next = movePlayerTo(next, player, pos, effect.collectGo);
      const movedPlayer =
        next.players.find((p) => p.id === player.id) ?? player;
      return handleLanding(next, movedPlayer);
    }

    case "MOVE_STEPS": {
      const newPos = (player.position + effect.steps + BOARD_SIZE) % BOARD_SIZE;
      next = movePlayerTo(next, player, newPos, false);
      const movedPlayer =
        next.players.find((p) => p.id === player.id) ?? player;
      return handleLanding(next, movedPlayer);
    }

    case "MOVE_NEAREST": {
      const positions = BOARD.filter((t) => t.type === effect.tileType).map(
        (t) => t.position,
      );
      const firstPos = positions[0];
      if (firstPos === undefined) return next;
      const nearest = positions.reduce((best, pos) => {
        const dist = (pos - player.position + BOARD_SIZE) % BOARD_SIZE;
        const bestDist = (best - player.position + BOARD_SIZE) % BOARD_SIZE;
        return dist < bestDist ? pos : best;
      }, firstPos);
      next = movePlayerTo(next, player, nearest, true);
      const movedPlayer =
        next.players.find((p) => p.id === player.id) ?? player;
      return handleLanding(next, movedPlayer);
    }

    case "GET_OUT_OF_JAIL":
      return updatePlayer(next, player.id, {
        outOfJailCards: player.outOfJailCards + 1,
      });

    case "GO_TO_JAIL":
      return sendToJail(next, player);

    case "REPAIRS": {
      const repairCost = player.ownedProperties.reduce((sum, op) => {
        const h = op.houses;
        return (
          sum + (h === HOTEL_HOUSES ? effect.perHotel : h * effect.perHouse)
        );
      }, 0);
      return updatePlayer(next, player.id, {
        balance: player.balance - repairCost,
      });
    }

    case "COLLECT_FROM_EACH": {
      const others = next.players.filter(
        (p) => p.id !== player.id && !p.isBankrupt,
      );
      const total = others.length * effect.amount;
      next = others.reduce(
        (s, p) => updatePlayer(s, p.id, { balance: p.balance - effect.amount }),
        next,
      );
      return updatePlayer(next, player.id, { balance: player.balance + total });
    }

    case "PAY_EACH": {
      const others = next.players.filter(
        (p) => p.id !== player.id && !p.isBankrupt,
      );
      next = others.reduce(
        (s, p) => updatePlayer(s, p.id, { balance: p.balance + effect.amount }),
        next,
      );
      return updatePlayer(next, player.id, {
        balance: player.balance - effect.amount * others.length,
      });
    }

    default:
      return next;
  }
}

function checkWin(state: MonopolyState): MonopolyState {
  const active = state.players.filter((p) => !p.isBankrupt);
  const winner = active[0];
  if (active.length === 1 && winner !== undefined) {
    return {
      ...addLog(state, `${winner.name} wins the game!`),
      turnPhase: "GAME_OVER",
      winnerId: winner.id,
    };
  }
  return state;
}

function applyAction(
  state: MonopolyState,
  action: MonopolyMove,
): MonopolyState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  let next = state;

  switch (action.type) {
    case "ROLL_DICE": {
      if (state.turnPhase !== "WAITING_FOR_ROLL") return state;

      const { die1, die2 } = action.payload;
      const isDoubles = die1 === die2;
      const diceTotal = die1 + die2;
      next = { ...next, dice: [die1, die2] };

      if (player.inJail) {
        if (isDoubles) {
          next = updatePlayer(next, player.id, {
            inJail: false,
            jailTurnsUsed: 0,
          });
          next = addLog(
            next,
            `${player.name} rolled doubles and got out of Jail!`,
          );
        } else {
          const newJailTurns = player.jailTurnsUsed + 1;
          if (newJailTurns >= MAX_JAIL_TURNS) {
            next = updatePlayer(next, player.id, {
              inJail: false,
              jailTurnsUsed: 0,
              balance: player.balance - JAIL_FINE,
            });
            next = addLog(
              next,
              `${player.name} paid $${JAIL_FINE} to leave Jail after ${MAX_JAIL_TURNS} turns.`,
            );
          } else {
            next = updatePlayer(next, player.id, {
              jailTurnsUsed: newJailTurns,
            });
            next = addLog(
              next,
              `${player.name} stays in Jail (turn ${newJailTurns}/${MAX_JAIL_TURNS}).`,
            );
            return { ...next, turnPhase: "WAITING_FOR_END_TURN" };
          }
        }
      }

      const movedPlayer =
        next.players.find((p) => p.id === player.id) ?? player;
      const newPos = (movedPlayer.position + diceTotal) % BOARD_SIZE;
      const passedGo = newPos < movedPlayer.position;
      next = updatePlayer(next, player.id, {
        position: newPos,
        balance: passedGo
          ? movedPlayer.balance + GO_SALARY
          : movedPlayer.balance,
      });
      if (passedGo) {
        next = addLog(
          next,
          `${player.name} passed GO and collected $${GO_SALARY}.`,
        );
      }
      const tile = state.board[newPos];
      if (tile) {
        next = addLog(next, `${player.name} moved to ${tile.name}.`);
      }

      const newDoublesCount = isDoubles ? state.doublesCount + 1 : 0;
      if (isDoubles && newDoublesCount >= 3) {
        const freshPlayer =
          next.players.find((p) => p.id === player.id) ?? player;
        return sendToJail({ ...next, doublesCount: 0 }, freshPlayer);
      }

      next = { ...next, doublesCount: newDoublesCount };

      const landedPlayer =
        next.players.find((p) => p.id === player.id) ?? player;
      next = handleLanding(next, landedPlayer);

      if (next.turnPhase === "WAITING_FOR_ROLL") {
        next = {
          ...next,
          turnPhase: isDoubles ? "WAITING_FOR_ROLL" : "WAITING_FOR_END_TURN",
        };
      }

      return next;
    }

    case "BUY_PROPERTY": {
      if (state.turnPhase !== "LANDED") return state;
      const tile = state.board[player.position];
      if (
        !tile ||
        (tile.type !== "Property" &&
          tile.type !== "Railroad" &&
          tile.type !== "Utility")
      ) {
        return state;
      }
      if (ownerOf(state, tile.id)) return state;

      const price = (tile as PropertyTile | RailroadTile | UtilityTile).price;
      if (player.balance < price) {
        return addLog(state, `${player.name} cannot afford ${tile.name}.`);
      }

      const newProp: OwnedProperty = {
        tileId: tile.id,
        houses: 0,
        isMortgaged: false,
      };
      next = updatePlayer(next, player.id, {
        balance: player.balance - price,
        ownedProperties: [...player.ownedProperties, newProp],
      });
      next = addLog(next, `${player.name} bought ${tile.name} for $${price}.`);
      return { ...next, turnPhase: "WAITING_FOR_END_TURN" };
    }

    case "DECLINE_PURCHASE": {
      if (state.turnPhase !== "LANDED") return state;
      const tile = state.board[player.position];
      if (tile) {
        next = addLog(next, `${player.name} declined to buy ${tile.name}.`);
      }
      return { ...next, turnPhase: "WAITING_FOR_END_TURN" };
    }

    case "BUILD_HOUSE": {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as PropertyTile;
      if (tile?.type !== "Property") return state;
      const op = getOwnedProp(player, tileId);
      if (!op || op.isMortgaged) return state;
      if (op.houses >= HOTEL_HOUSES) {
        return addLog(state, `${tile.name} already has a hotel.`);
      }
      if (
        countGroupOwned(next, tile.group, player.id) !== groupSize(tile.group)
      ) {
        return addLog(
          state,
          `${player.name} does not own the full ${tile.group} group.`,
        );
      }
      if (player.balance < tile.houseCost) {
        return addLog(
          state,
          `${player.name} cannot afford a house on ${tile.name}.`,
        );
      }

      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, houses: p.houses + 1 } : p,
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance - tile.houseCost,
        ownedProperties: updatedProps,
      });
      const houseName = op.houses + 1 === HOTEL_HOUSES ? "hotel" : "house";
      return addLog(
        next,
        `${player.name} built a ${houseName} on ${tile.name}.`,
      );
    }

    case "SELL_HOUSE": {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as PropertyTile;
      if (tile?.type !== "Property") return state;
      const op = getOwnedProp(player, tileId);
      if (!op || op.houses === 0) {
        return addLog(state, `No houses to sell on ${tile.name}.`);
      }

      const refund = Math.floor(tile.houseCost / 2);
      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, houses: p.houses - 1 } : p,
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance + refund,
        ownedProperties: updatedProps,
      });
      return addLog(
        next,
        `${player.name} sold a house on ${tile.name} for $${refund}.`,
      );
    }

    case "MORTGAGE_PROPERTY": {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as
        | PropertyTile
        | RailroadTile
        | UtilityTile;
      const op = getOwnedProp(player, tileId);
      if (!op || op.isMortgaged) return state;
      const mortgageVal = Math.floor(
        (tile as PropertyTile).price * MORTGAGE_RATE,
      );
      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, isMortgaged: true } : p,
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance + mortgageVal,
        ownedProperties: updatedProps,
      });
      return addLog(
        next,
        `${player.name} mortgaged ${tile.name} for $${mortgageVal}.`,
      );
    }

    case "UNMORTGAGE_PROPERTY": {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as
        | PropertyTile
        | RailroadTile
        | UtilityTile;
      const op = getOwnedProp(player, tileId);
      if (!op?.isMortgaged) return state;
      const unmortgageCost = Math.floor(
        (tile as PropertyTile).price * UNMORTGAGE_RATE,
      );
      if (player.balance < unmortgageCost) {
        return addLog(
          state,
          `${player.name} cannot afford to unmortgage ${tile.name}.`,
        );
      }
      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, isMortgaged: false } : p,
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance - unmortgageCost,
        ownedProperties: updatedProps,
      });
      return addLog(
        next,
        `${player.name} unmortgaged ${tile.name} for $${unmortgageCost}.`,
      );
    }

    case "PAY_JAIL_FINE": {
      if (!player.inJail || state.turnPhase !== "WAITING_FOR_ROLL") {
        return state;
      }
      if (player.balance < JAIL_FINE) {
        return addLog(state, `${player.name} cannot afford the fine.`);
      }
      next = updatePlayer(next, player.id, {
        balance: player.balance - JAIL_FINE,
        inJail: false,
        jailTurnsUsed: 0,
      });
      return addLog(
        next,
        `${player.name} paid $${JAIL_FINE} to get out of Jail.`,
      );
    }

    case "USE_OUT_OF_JAIL_CARD": {
      if (!player.inJail || player.outOfJailCards === 0) return state;
      next = updatePlayer(next, player.id, {
        inJail: false,
        jailTurnsUsed: 0,
        outOfJailCards: player.outOfJailCards - 1,
      });
      return addLog(next, `${player.name} used a Get Out of Jail Free card.`);
    }

    case "END_TURN": {
      if (state.turnPhase !== "WAITING_FOR_END_TURN") return state;
      const activePlayers = state.players.filter((p) => !p.isBankrupt);
      const nextIndex =
        (activePlayers.findIndex((p) => p.id === player.id) + 1) %
        activePlayers.length;
      const nextPlayer = activePlayers[nextIndex];
      if (nextPlayer === undefined) return state;
      const realIndex = state.players.findIndex((p) => p.id === nextPlayer.id);
      next = {
        ...next,
        currentPlayerIndex: realIndex,
        turnPhase: "WAITING_FOR_ROLL",
        doublesCount: 0,
      };
      return addLog(next, `${nextPlayer.name}'s turn.`);
    }

    case "DECLARE_BANKRUPTCY": {
      next = updatePlayer(next, player.id, { isBankrupt: true });
      next = addLog(next, `${player.name} has declared bankruptcy!`);
      next = checkWin(next);
      if (next.turnPhase === "GAME_OVER") return next;
      return applyAction(next, { type: "END_TURN" });
    }

    case "DRAW_CARD": {
      if (state.turnPhase !== "LANDED") return state;
      const tile = state.board[player.position];
      if (!tile || (tile.type !== "Chance" && tile.type !== "CommunityChest")) {
        return state;
      }

      const deckKey = tile.type === "Chance" ? "chanceDeck" : "communityDeck";
      next = drawCard(next, player, deckKey);

      const updatedPlayer =
        next.players.find((p) => p.id === player.id) ?? player;
      const newTile = next.board[updatedPlayer.position];
      if (!newTile) return next;

      const isUnownedProperty =
        (newTile.type === "Property" ||
          newTile.type === "Railroad" ||
          newTile.type === "Utility") &&
        !ownerOf(next, newTile.id);

      const isNewCardSpace =
        (newTile.type === "Chance" || newTile.type === "CommunityChest") &&
        updatedPlayer.position !== player.position;

      if (isUnownedProperty || isNewCardSpace) {
        return { ...next, turnPhase: "LANDED" };
      }
      return { ...next, turnPhase: "WAITING_FOR_END_TURN" };
    }

    default:
      return state;
  }
}

export const monopolyEngine: GameEngine<MonopolyState, MonopolyMove> = {
  type: MONOPOLY,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 8,
  roles: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],

  createInitialState(seats: Seat[]): MonopolyState {
    const playerTokens = ["🎩", "🚗", "🐶", "👢", "⛵", "🎲", "🏖️", "🚂"];
    const players: Player[] = seats.map((seat, i) => ({
      id: seat.role,
      name: `Player ${i + 1}`,
      token: playerTokens[i % playerTokens.length] ?? "🎩",
      balance: 1500,
      position: 0,
      inJail: false,
      jailTurnsUsed: 0,
      outOfJailCards: 0,
      isBankrupt: false,
      ownedProperties: [],
    }));

    return {
      board: BOARD as Tile[],
      players,
      currentPlayerIndex: 0,
      turnPhase: "WAITING_FOR_ROLL",
      dice: [1, 1],
      doublesCount: 0,
      chanceDeck: shuffle(CHANCE_CARDS),
      communityDeck: shuffle(COMMUNITY_CHEST_CARDS),
      log: [
        `Game started with ${players.map((p) => p.name).join(", ")}. ${players[0]?.name ?? "Player 1"}'s turn.`,
      ],
      winnerId: null,
    };
  },

  reduce(state, ctx, input): ReduceResult<MonopolyState> {
    if (state.turnPhase === "GAME_OVER") {
      return { ok: false, error: "Game is over" };
    }
    const player = state.players[state.currentPlayerIndex];
    if (!player) {
      return { ok: false, error: "Player not found" };
    }
    if (player.id !== ctx.role) {
      return { ok: false, error: "Not your turn" };
    }

    const parsed = monopolyMoveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid move format" };
    }

    const nextState = applyAction(state, parsed.data);
    let outcomeStatus: "active" | "completed" = "active";
    let winnerRole: string | null = null;
    if (nextState.turnPhase === "GAME_OVER") {
      outcomeStatus = "completed";
      winnerRole = nextState.winnerId;
    }

    return {
      ok: true,
      state: nextState,
      outcome: {
        status: outcomeStatus,
        winnerRole,
        draw: false,
      },
    };
  },
};
export { applyAction };
