import type {
  GameState, Action, Player, OwnedProperty,
  PropertyTile, RailroadTile, UtilityTile, Tile,
} from '../types';
import {
  JAIL_POSITION, GO_POSITION, GO_SALARY, JAIL_FINE,
  MAX_JAIL_TURNS, TILE_BY_ID, BOARD,
  HOTEL_HOUSES, MAX_HOUSES, MORTGAGE_RATE, UNMORTGAGE_RATE,
  BOARD_SIZE,
} from '../constants/board';

// ─── Immutable helpers ────────────────────────────────────────────────────────

function updatePlayer(state: GameState, playerId: string, patch: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  };
}

function addLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

// ─── Ownership helpers ────────────────────────────────────────────────────────

function ownerOf(state: GameState, tileId: string): Player | undefined {
  return state.players.find((p) =>
    p.ownedProperties.some((op) => op.tileId === tileId)
  );
}

function getOwnedProp(player: Player, tileId: string): OwnedProperty | undefined {
  return player.ownedProperties.find((op) => op.tileId === tileId);
}

function countGroupOwned(state: GameState, group: string, playerId: string): number {
  return BOARD.filter(
    (t) => (t.type === 'Property') && (t as PropertyTile).group === group
  ).filter((t) =>
    state.players.find((p) => p.id === playerId)?.ownedProperties.some((op) => op.tileId === t.id)
  ).length;
}

function groupSize(group: string): number {
  return BOARD.filter((t) => t.type === 'Property' && (t as PropertyTile).group === group).length;
}

// ─── Rent calculations ────────────────────────────────────────────────────────

function calcPropertyRent(tile: PropertyTile, owner: Player, state: GameState): number {
  const op = getOwnedProp(owner, tile.id);
  if (!op || op.isMortgaged) return 0;
  const houses = op.houses;
  const monopoly = countGroupOwned(state, tile.group, owner.id) === groupSize(tile.group);
  if (houses === 0) return monopoly ? tile.rent[0] * 2 : tile.rent[0];
  return tile.rent[Math.min(houses, 5)];
}

function calcRailroadRent(tile: RailroadTile, owner: Player, state: GameState): number {
  const op = getOwnedProp(owner, tile.id);
  if (!op || op.isMortgaged) return 0;
  const count = state.players
    .find((p) => p.id === owner.id)!
    .ownedProperties.filter((op2) =>
      (TILE_BY_ID[op2.tileId] as Tile).type === 'Railroad'
    ).length;
  return tile.rent[count] ?? 0;
}

function calcUtilityRent(owner: Player, state: GameState, diceTotal: number): number {
  const utilsOwned = owner.ownedProperties.filter((op) =>
    (TILE_BY_ID[op.tileId] as Tile).type === 'Utility' && !op.isMortgaged
  ).length;
  return diceTotal * (utilsOwned === 2 ? 10 : 4);
}

// ─── Movement ────────────────────────────────────────────────────────────────

function movePlayerTo(state: GameState, player: Player, newPos: number, collectGo = true): GameState {
  const passedGo = collectGo && newPos < player.position;
  let next = updatePlayer(state, player.id, {
    position: newPos,
    balance: passedGo ? player.balance + GO_SALARY : player.balance,
  });
  if (passedGo) next = addLog(next, `${player.name} passed GO and collected $${GO_SALARY}.`);
  return next;
}

function sendToJail(state: GameState, player: Player): GameState {
  let next = updatePlayer(state, player.id, {
    position: JAIL_POSITION,
    inJail: true,
    jailTurnsUsed: 0,
  });
  next = addLog(next, `${player.name} is sent to Jail!`);
  return { ...next, turnPhase: 'WAITING_FOR_END_TURN', doublesCount: 0 };
}

// ─── Land on tile ────────────────────────────────────────────────────────────

function handleLanding(state: GameState, player: Player): GameState {
  const tile = state.board[player.position];
  let next = state;

  switch (tile.type) {
    case 'Go':
      return addLog(next, `${player.name} landed on GO.`);

    case 'GoToJail':
      return sendToJail(next, player);

    case 'FreeParking':
    case 'Jail':
      return addLog(next, `${player.name} is just visiting Jail / Free Parking.`);

    case 'IncomeTax':
      next = updatePlayer(next, player.id, { balance: player.balance - tile.amount });
      return addLog(next, `${player.name} paid Income Tax of $${tile.amount}.`);

    case 'LuxuryTax':
      next = updatePlayer(next, player.id, { balance: player.balance - tile.amount });
      return addLog(next, `${player.name} paid Luxury Tax of $${tile.amount}.`);

    case 'CommunityChest':
    case 'Chance':
      // Card drawing is deferred — phase stays 'LANDED' so UI can trigger card draw
      return { ...addLog(next, `${player.name} landed on ${tile.name}.`), turnPhase: 'LANDED' };

    case 'Property':
    case 'Railroad':
    case 'Utility': {
      const owner = ownerOf(next, tile.id);
      if (!owner) {
        // Unowned — offer purchase
        next = addLog(next, `${player.name} landed on ${tile.name}. No owner — available to buy.`);
        return { ...next, turnPhase: 'LANDED' };
      }
      if (owner.id === player.id) {
        return addLog(next, `${player.name} owns ${tile.name}.`);
      }
      // Pay rent
      const diceTotal = next.dice[0] + next.dice[1];
      let rent = 0;
      if (tile.type === 'Property') rent = calcPropertyRent(tile as PropertyTile, owner, next);
      else if (tile.type === 'Railroad') rent = calcRailroadRent(tile as RailroadTile, owner, next);
      else rent = calcUtilityRent(owner, next, diceTotal);

      next = updatePlayer(next, player.id, { balance: player.balance - rent });
      next = updatePlayer(next, owner.id, { balance: owner.balance + rent });
      return addLog(next, `${player.name} paid $${rent} rent to ${owner.name} for ${tile.name}.`);
    }

    default:
      return next;
  }
}

// ─── Card deck helpers ────────────────────────────────────────────────────────

function drawCard(state: GameState, player: Player, deckKey: 'chanceDeck' | 'communityDeck'): GameState {
  const deck = [...state[deckKey]];
  const [card, ...rest] = deck;
  if (!card) return state;

  let next: GameState = { ...state, [deckKey]: [...rest, card] }; // rotate to bottom
  next = addLog(next, `${player.name} drew: "${card.text}"`);

  const { effect } = card;

  switch (effect.kind) {
    case 'COLLECT':
      return updatePlayer(next, player.id, { balance: player.balance + effect.amount });

    case 'PAY':
      return updatePlayer(next, player.id, { balance: player.balance - effect.amount });

    case 'MOVE_TO': {
      const pos = effect.position;
      next = movePlayerTo(next, player, pos, effect.collectGo);
      const movedPlayer = next.players.find((p) => p.id === player.id)!;
      return handleLanding(next, movedPlayer);
    }

    case 'MOVE_STEPS': {
      const newPos = (player.position + effect.steps + BOARD_SIZE) % BOARD_SIZE;
      next = movePlayerTo(next, player, newPos, false);
      const movedPlayer = next.players.find((p) => p.id === player.id)!;
      return handleLanding(next, movedPlayer);
    }

    case 'MOVE_NEAREST': {
      const positions = BOARD
        .filter((t) => t.type === effect.tileType)
        .map((t) => t.position);
      const nearest = positions.reduce((best, pos) => {
        const dist = (pos - player.position + BOARD_SIZE) % BOARD_SIZE;
        const bestDist = (best - player.position + BOARD_SIZE) % BOARD_SIZE;
        return dist < bestDist ? pos : best;
      }, positions[0]);
      next = movePlayerTo(next, player, nearest, true);
      const movedPlayer = next.players.find((p) => p.id === player.id)!;
      return handleLanding(next, movedPlayer);
    }

    case 'GET_OUT_OF_JAIL':
      return updatePlayer(next, player.id, { outOfJailCards: player.outOfJailCards + 1 });

    case 'GO_TO_JAIL':
      return sendToJail(next, player);

    case 'REPAIRS': {
      const repairCost = player.ownedProperties.reduce((sum, op) => {
        const h = op.houses;
        return sum + (h === HOTEL_HOUSES ? effect.perHotel : h * effect.perHouse);
      }, 0);
      return updatePlayer(next, player.id, { balance: player.balance - repairCost });
    }

    case 'COLLECT_FROM_EACH': {
      const others = next.players.filter((p) => p.id !== player.id && !p.isBankrupt);
      const total = others.length * effect.amount;
      next = others.reduce(
        (s, p) => updatePlayer(s, p.id, { balance: p.balance - effect.amount }),
        next
      );
      return updatePlayer(next, player.id, { balance: player.balance + total });
    }

    case 'PAY_EACH': {
      const others = next.players.filter((p) => p.id !== player.id && !p.isBankrupt);
      next = others.reduce(
        (s, p) => updatePlayer(s, p.id, { balance: p.balance + effect.amount }),
        next
      );
      return updatePlayer(next, player.id, { balance: player.balance - effect.amount * others.length });
    }

    default:
      return next;
  }
}

// ─── Win condition ────────────────────────────────────────────────────────────

function checkWin(state: GameState): GameState {
  const active = state.players.filter((p) => !p.isBankrupt);
  if (active.length === 1) {
    return {
      ...addLog(state, `${active[0].name} wins the game!`),
      turnPhase: 'GAME_OVER',
      winnerId: active[0].id,
    };
  }
  return state;
}

// ─── applyAction — the single entry point ────────────────────────────────────

/**
 * Pure function. Takes the current GameState and an Action, returns the next GameState.
 * No mutations, no side effects, deterministic.
 */
export function applyAction(state: GameState, action: Action): GameState {
  const player = currentPlayer(state);
  let next = state;

  switch (action.type) {
    // ── ROLL_DICE ──────────────────────────────────────────────────────────
    case 'ROLL_DICE': {
      if (state.turnPhase !== 'WAITING_FOR_ROLL') return state;

      const { die1, die2 } = action.payload;
      const isDoubles = die1 === die2;
      const diceTotal = die1 + die2;
      next = { ...next, dice: [die1, die2] };

      if (player.inJail) {
        if (isDoubles) {
          next = updatePlayer(next, player.id, { inJail: false, jailTurnsUsed: 0 });
          next = addLog(next, `${player.name} rolled doubles and got out of Jail!`);
        } else {
          const newJailTurns = player.jailTurnsUsed + 1;
          if (newJailTurns >= MAX_JAIL_TURNS) {
            next = updatePlayer(next, player.id, {
              inJail: false, jailTurnsUsed: 0, balance: player.balance - JAIL_FINE,
            });
            next = addLog(next, `${player.name} paid $${JAIL_FINE} to leave Jail after ${MAX_JAIL_TURNS} turns.`);
          } else {
            next = updatePlayer(next, player.id, { jailTurnsUsed: newJailTurns });
            next = addLog(next, `${player.name} stays in Jail (turn ${newJailTurns}/${MAX_JAIL_TURNS}).`);
            return { ...next, turnPhase: 'WAITING_FOR_END_TURN' };
          }
        }
      }

      // Move player
      const movedPlayer = next.players.find((p) => p.id === player.id)!;
      const newPos = (movedPlayer.position + diceTotal) % BOARD_SIZE;
      const passedGo = newPos < movedPlayer.position;
      next = updatePlayer(next, player.id, {
        position: newPos,
        balance: passedGo ? movedPlayer.balance + GO_SALARY : movedPlayer.balance,
      });
      if (passedGo) next = addLog(next, `${player.name} passed GO and collected $${GO_SALARY}.`);
      next = addLog(next, `${player.name} moved to ${state.board[newPos].name}.`);

      // Three doubles → jail
      const newDoublesCount = isDoubles ? state.doublesCount + 1 : 0;
      if (isDoubles && newDoublesCount >= 3) {
        const freshPlayer = next.players.find((p) => p.id === player.id)!;
        return sendToJail({ ...next, doublesCount: 0 }, freshPlayer);
      }

      next = { ...next, doublesCount: newDoublesCount };

      // Handle landing
      const landedPlayer = next.players.find((p) => p.id === player.id)!;
      next = handleLanding(next, landedPlayer);

      // If not already overridden by landing (jail/chest), set phase
      if (next.turnPhase === 'WAITING_FOR_ROLL') {
        next = { ...next, turnPhase: isDoubles ? 'WAITING_FOR_ROLL' : 'WAITING_FOR_END_TURN' };
      }

      return next;
    }

    // ── BUY_PROPERTY ──────────────────────────────────────────────────────
    case 'BUY_PROPERTY': {
      if (state.turnPhase !== 'LANDED') return state;
      const tile = state.board[player.position];
      if (tile.type !== 'Property' && tile.type !== 'Railroad' && tile.type !== 'Utility') return state;
      if (ownerOf(state, tile.id)) return state;

      const price = (tile as PropertyTile | RailroadTile | UtilityTile).price;
      if (player.balance < price) return addLog(state, `${player.name} cannot afford ${tile.name}.`);

      const newProp: OwnedProperty = { tileId: tile.id, houses: 0, isMortgaged: false };
      next = updatePlayer(next, player.id, {
        balance: player.balance - price,
        ownedProperties: [...player.ownedProperties, newProp],
      });
      next = addLog(next, `${player.name} bought ${tile.name} for $${price}.`);
      return { ...next, turnPhase: 'WAITING_FOR_END_TURN' };
    }

    // ── DECLINE_PURCHASE ──────────────────────────────────────────────────
    case 'DECLINE_PURCHASE': {
      if (state.turnPhase !== 'LANDED') return state;
      next = addLog(next, `${player.name} declined to buy ${state.board[player.position].name}.`);
      return { ...next, turnPhase: 'WAITING_FOR_END_TURN' };
    }

    // ── BUILD_HOUSE ───────────────────────────────────────────────────────
    case 'BUILD_HOUSE': {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as PropertyTile;
      if (!tile || tile.type !== 'Property') return state;
      const op = getOwnedProp(player, tileId);
      if (!op || op.isMortgaged) return state;
      if (op.houses >= HOTEL_HOUSES) return addLog(state, `${tile.name} already has a hotel.`);
      // Must own full colour group
      if (countGroupOwned(next, tile.group, player.id) !== groupSize(tile.group))
        return addLog(state, `${player.name} does not own the full ${tile.group} group.`);
      if (player.balance < tile.houseCost) return addLog(state, `${player.name} cannot afford a house on ${tile.name}.`);

      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, houses: p.houses + 1 } : p
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance - tile.houseCost,
        ownedProperties: updatedProps,
      });
      const houseName = op.houses + 1 === HOTEL_HOUSES ? 'hotel' : 'house';
      return addLog(next, `${player.name} built a ${houseName} on ${tile.name}.`);
    }

    // ── SELL_HOUSE ────────────────────────────────────────────────────────
    case 'SELL_HOUSE': {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as PropertyTile;
      if (!tile || tile.type !== 'Property') return state;
      const op = getOwnedProp(player, tileId);
      if (!op || op.houses === 0) return addLog(state, `No houses to sell on ${tile.name}.`);

      const refund = Math.floor(tile.houseCost / 2);
      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, houses: p.houses - 1 } : p
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance + refund,
        ownedProperties: updatedProps,
      });
      return addLog(next, `${player.name} sold a house on ${tile.name} for $${refund}.`);
    }

    // ── MORTGAGE_PROPERTY ─────────────────────────────────────────────────
    case 'MORTGAGE_PROPERTY': {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as PropertyTile | RailroadTile | UtilityTile;
      const op = getOwnedProp(player, tileId);
      if (!op || op.isMortgaged) return state;
      const mortgageVal = Math.floor((tile as PropertyTile).price * MORTGAGE_RATE);
      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, isMortgaged: true } : p
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance + mortgageVal,
        ownedProperties: updatedProps,
      });
      return addLog(next, `${player.name} mortgaged ${tile.name} for $${mortgageVal}.`);
    }

    // ── UNMORTGAGE_PROPERTY ───────────────────────────────────────────────
    case 'UNMORTGAGE_PROPERTY': {
      const { tileId } = action.payload;
      const tile = TILE_BY_ID[tileId] as PropertyTile | RailroadTile | UtilityTile;
      const op = getOwnedProp(player, tileId);
      if (!op || !op.isMortgaged) return state;
      const unmortgageCost = Math.floor((tile as PropertyTile).price * UNMORTGAGE_RATE);
      if (player.balance < unmortgageCost) return addLog(state, `${player.name} cannot afford to unmortgage ${tile.name}.`);
      const updatedProps = player.ownedProperties.map((p) =>
        p.tileId === tileId ? { ...p, isMortgaged: false } : p
      );
      next = updatePlayer(next, player.id, {
        balance: player.balance - unmortgageCost,
        ownedProperties: updatedProps,
      });
      return addLog(next, `${player.name} unmortgaged ${tile.name} for $${unmortgageCost}.`);
    }

    // ── PAY_JAIL_FINE ─────────────────────────────────────────────────────
    case 'PAY_JAIL_FINE': {
      if (!player.inJail || state.turnPhase !== 'WAITING_FOR_ROLL') return state;
      if (player.balance < JAIL_FINE) return addLog(state, `${player.name} cannot afford the fine.`);
      next = updatePlayer(next, player.id, {
        balance: player.balance - JAIL_FINE,
        inJail: false,
        jailTurnsUsed: 0,
      });
      return addLog(next, `${player.name} paid $${JAIL_FINE} to get out of Jail.`);
    }

    // ── USE_OUT_OF_JAIL_CARD ──────────────────────────────────────────────
    case 'USE_OUT_OF_JAIL_CARD': {
      if (!player.inJail || player.outOfJailCards === 0) return state;
      next = updatePlayer(next, player.id, {
        inJail: false,
        jailTurnsUsed: 0,
        outOfJailCards: player.outOfJailCards - 1,
      });
      return addLog(next, `${player.name} used a Get Out of Jail Free card.`);
    }

    // ── END_TURN ──────────────────────────────────────────────────────────
    case 'END_TURN': {
      if (state.turnPhase !== 'WAITING_FOR_END_TURN') return state;
      const nextIndex = (state.currentPlayerIndex + 1) % state.players.filter((p) => !p.isBankrupt).length;
      const activePlayers = state.players.filter((p) => !p.isBankrupt);
      const nextPlayer = activePlayers[nextIndex];
      const realIndex = state.players.findIndex((p) => p.id === nextPlayer.id);
      next = {
        ...next,
        currentPlayerIndex: realIndex,
        turnPhase: 'WAITING_FOR_ROLL',
        doublesCount: 0,
      };
      return addLog(next, `${nextPlayer.name}'s turn.`);
    }

    // ── DECLARE_BANKRUPTCY ────────────────────────────────────────────────
    case 'DECLARE_BANKRUPTCY': {
      next = updatePlayer(next, player.id, { isBankrupt: true });
      next = addLog(next, `${player.name} has declared bankruptcy!`);
      next = checkWin(next);
      if (next.turnPhase === 'GAME_OVER') return next;
      // Auto-advance turn
      return applyAction(next, { type: 'END_TURN' });
    }

    // ── DRAW_CARD ─────────────────────────────────────────────────────────
    case 'DRAW_CARD': {
      if (state.turnPhase !== 'LANDED') return state;
      const tile = state.board[player.position];
      if (tile.type !== 'Chance' && tile.type !== 'CommunityChest') return state;

      const deckKey = tile.type === 'Chance' ? 'chanceDeck' : 'communityDeck';
      next = drawCard(next, player, deckKey);

      const updatedPlayer = next.players.find((p) => p.id === player.id)!;
      const newTile = next.board[updatedPlayer.position];

      const isUnownedProperty =
        (newTile.type === 'Property' || newTile.type === 'Railroad' || newTile.type === 'Utility') &&
        !ownerOf(next, newTile.id);

      const isNewCardSpace =
        (newTile.type === 'Chance' || newTile.type === 'CommunityChest') &&
        updatedPlayer.position !== player.position;

      if (isUnownedProperty || isNewCardSpace) {
        return { ...next, turnPhase: 'LANDED' };
      } else {
        return { ...next, turnPhase: 'WAITING_FOR_END_TURN' };
      }
    }

    default:
      return state;
  }
}
