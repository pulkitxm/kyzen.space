'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { GameState, Action, Card } from '../types';
import { BOARD_SIZE } from '../constants/board';
import { useSound } from './useSound';

// ─── UI Phase ─────────────────────────────────────────────────────────────────

export type UIPhase =
  | 'WAITING_FOR_ROLL'
  | 'ROLLING'
  | 'MOVING'
  | 'LANDING'
  | 'ACTION_REQUIRED'
  | 'TURN_END';

export type DiceAnimPhase = 'idle' | 'shaking' | 'rolling' | 'settling' | 'settled';

export interface FloatingText {
  id: string;
  text: string;
  /** 0-8 grid col (9×9 grid) */
  col: number;
  /** 0-8 grid row (9×9 grid) */
  row: number;
  color: string;
}

// ─── Position → grid cell (9×9 grid for 32-tile board) ───────────────────────
//
// Visual layout (9 cols × 9 rows, positions 0–31 clockwise):
//
//   [16]  [17] [18] [19] [20] [21] [22] [23]  [24]   ← top row (row=0)
//   [15]                                       [25]
//   [14]                                       [26]
//   [13]         center 7×7                    [27]
//   [12]                                       [28]
//   [11]                                       [29]
//   [10]                                       [30]
//    [9]                                       [31]
//    [8]   [7]  [6]  [5]  [4]  [3]  [2]  [1]   [0]   ← bottom row (row=8)
//
// col 0 = leftmost, col 8 = rightmost
// row 0 = topmost,  row 8 = bottommost

export function positionToCell(pos: number): [number, number] {
  // Bottom row: GO(0)=col8, pos1-7=cols7→1, Jail(8)=col0
  if (pos === 0)  return [8, 8]; // GO  (bottom-right)
  if (pos <= 7)   return [8, 8 - pos]; // bottom row right→left
  if (pos === 8)  return [8, 0]; // Jail (bottom-left)
  // Left col: pos9-15=rows7→1, Free Parking(16)=row0
  if (pos <= 15)  return [8 - (pos - 8), 0]; // left col bottom→top
  if (pos === 16) return [0, 0]; // Free Parking (top-left)
  // Top row: pos17-23=cols1→7, Go To Jail(24)=col8
  if (pos <= 23)  return [0, pos - 16]; // top row left→right
  if (pos === 24) return [0, 8]; // Go To Jail (top-right)
  // Right col: pos25-31=rows1→7
  if (pos <= 31)  return [pos - 24, 8]; // right col top→bottom
  return [8, 8]; // fallback to GO
}

function buildPath(from: number, to: number): number[] {
  const path: number[] = [];
  let cur = from;
  while (cur !== to) {
    cur = (cur + 1) % BOARD_SIZE;
    path.push(cur);
  }
  return path;
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

let _floatId = 0;
function nextFloatId() { return String(++_floatId); }

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGamePhase(
  state: GameState,
  dispatch: (a: Action) => void,
) {
  const sounds = useSound();

  const [uiPhase, setUiPhase] = useState<UIPhase>('WAITING_FOR_ROLL');
  const stateRef = useRef<GameState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [diceAnimPhase, setDiceAnimPhase] = useState<DiceAnimPhase>('idle');
  const [diceDisplay, setDiceDisplay] = useState<[number, number]>([1, 1]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  // Timer & Drawn Card States
  const [cardDrawCountdown, setCardDrawCountdown] = useState<number | null>(null);
  const [endTurnCountdown, setEndTurnCountdown] = useState<number | null>(null);
  const [drawnCard, setDrawnCard] = useState<{ card: Card; type: 'Chance' | 'CommunityChest' } | null>(null);

  // Animated token positions (per player id)
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    state.players.forEach((p) => { m[p.id] = p.position; });
    return m;
  });

  // The cell we want to highlight as the movement destination
  const [destinationCell, setDestinationCell] = useState<number | null>(null);

  const animCancelRef = useRef(false);
  const isMovingRef = useRef(false);

  // Sync animated positions when NOT moving
  useEffect(() => {
    if (!isMovingRef.current) {
      setAnimatedPositions((prev) => {
        const next = { ...prev };
        state.players.forEach((p) => { next[p.id] = p.position; });
        return next;
      });
    }
  }, [state.players]);

  // Remove floating text after animation
  const removeFloat = useCallback((id: string) => {
    setFloatingTexts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addFloat = useCallback((text: string, position: number, color: string) => {
    const [row, col] = positionToCell(position);
    const id = nextFloatId();
    setFloatingTexts((prev) => [...prev, { id, text, col, row, color }]);
    setTimeout(() => removeFloat(id), 1800);
  }, [removeFloat]);

  // ── Sync uiPhase with engine phase ───────────────────────────────────────────
  useEffect(() => {
    if (isMovingRef.current) return;
    if (state.turnPhase === 'GAME_OVER') { setUiPhase('TURN_END'); return; }
    if (uiPhase === 'ROLLING' || uiPhase === 'MOVING' || uiPhase === 'LANDING') return;
    if (state.turnPhase === 'WAITING_FOR_ROLL') setUiPhase('WAITING_FOR_ROLL');
    else if (state.turnPhase === 'LANDED') setUiPhase('ACTION_REQUIRED');
    else if (state.turnPhase === 'WAITING_FOR_END_TURN') setUiPhase('TURN_END');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnPhase]);

  // ── Wrapped dispatch with floating text for balance diffs ─────────────────────
  const balanceSnapshotRef = useRef<Record<string, number>>({});
  const positionSnapshotRef = useRef<Record<string, number>>({});

  const wrappedDispatch = useCallback((action: Action) => {
    const prevBalances: Record<string, number> = {};
    stateRef.current.players.forEach((p) => { prevBalances[p.id] = p.balance; });
    const prevPositions: Record<string, number> = {};
    stateRef.current.players.forEach((p) => { prevPositions[p.id] = p.position; });

    // Play sounds for specific actions
    if (action.type === 'BUY_PROPERTY') sounds.playBuy();
    else if (action.type === 'DRAW_CARD') sounds.playCardDraw();
    else if (action.type === 'DECLARE_BANKRUPTCY') sounds.playJail();

    dispatch(action);
    balanceSnapshotRef.current = prevBalances;
    positionSnapshotRef.current = prevPositions;
  }, [dispatch, sounds]);

  useEffect(() => {
    const prev = balanceSnapshotRef.current;
    if (!Object.keys(prev).length) return;
    state.players.forEach((p) => {
      const diff = p.balance - (prev[p.id] ?? p.balance);
      if (diff !== 0 && !isMovingRef.current) {
        const color = diff > 0 ? '#4ade80' : '#f87171';
        addFloat(diff > 0 ? `+$${diff}` : `-$${Math.abs(diff)}`, p.position, color);
        // Play tax sound for negative balance changes (not during normal rent/buy)
        if (diff < 0) {
          const currentAction = balanceSnapshotRef.current;
          // Just play a soft sound for tax-type losses
        }
      }
    });
    balanceSnapshotRef.current = {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players]);

  // ── Card Drawing / Turn Ending Timers ─────────────────────────────────────────

  const drawCardAction = useCallback(() => {
    if (drawnCard || isMovingRef.current) return;
    const player = stateRef.current.players[stateRef.current.currentPlayerIndex];
    if (!player) return;
    const tile = stateRef.current.board[player.position];
    if (tile.type !== 'Chance' && tile.type !== 'CommunityChest') return;

    const deck = tile.type === 'Chance' ? stateRef.current.chanceDeck : stateRef.current.communityDeck;
    const topCard = deck[0];
    if (!topCard) return;

    setDrawnCard({ card: topCard, type: tile.type });
    setCardDrawCountdown(null);
    sounds.playCardDraw();

    setTimeout(() => {
      dispatch({ type: 'DRAW_CARD' });
      setDrawnCard(null);
    }, 2000);
  }, [dispatch, sounds, drawnCard]);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const currentTile = currentPlayer ? state.board[currentPlayer.position] : null;
  const mustDrawCard =
    state.turnPhase === 'LANDED' &&
    (currentTile?.type === 'Chance' || currentTile?.type === 'CommunityChest');

  // Timer for drawing cards
  useEffect(() => {
    if (mustDrawCard && !drawnCard && uiPhase === 'ACTION_REQUIRED') {
      let count = 3;
      setCardDrawCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(timer);
          setCardDrawCountdown(null);
          drawCardAction();
        } else {
          setCardDrawCountdown(count);
        }
      }, 1000);
      return () => {
        clearInterval(timer);
        setCardDrawCountdown(null);
      };
    } else {
      setCardDrawCountdown(null);
    }
  }, [mustDrawCard, drawnCard, uiPhase, drawCardAction]);

  // Timer for ending the turn
  useEffect(() => {
    if (state.turnPhase === 'WAITING_FOR_END_TURN' && uiPhase === 'TURN_END') {
      let count = 3;
      setEndTurnCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(timer);
          setEndTurnCountdown(null);
          wrappedDispatch({ type: 'END_TURN' });
        } else {
          setEndTurnCountdown(count);
        }
      }, 1000);
      return () => {
        clearInterval(timer);
        setEndTurnCountdown(null);
      };
    } else {
      setEndTurnCountdown(null);
    }
  }, [state.turnPhase, uiPhase, wrappedDispatch]);

  // ── Roll handler ──────────────────────────────────────────────────────────────

  const onRoll = useCallback(async () => {
    if (uiPhase !== 'WAITING_FOR_ROLL') return;
    if (state.turnPhase !== 'WAITING_FOR_ROLL') return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const currentPlayer = state.players[state.currentPlayerIndex];
    const fromPos = currentPlayer.position;

    animCancelRef.current = false;

    // Phase 1: Shake + play sound
    setUiPhase('ROLLING');
    setDiceAnimPhase('shaking');
    setDiceDisplay([d1, d2]);
    sounds.playDiceRoll();
    await sleep(400);
    if (animCancelRef.current) return;

    // Phase 2: Roll
    setDiceAnimPhase('rolling');
    await sleep(600);
    if (animCancelRef.current) return;

    // Phase 3: Settle
    setDiceAnimPhase('settling');
    await sleep(300);
    if (animCancelRef.current) return;
    setDiceAnimPhase('settled');

    // ── KEY FIX: set isMoving BEFORE dispatching so the useEffect sync
    // cannot overwrite animatedPositions during the animation loop ──────
    isMovingRef.current = true;

    // Dispatch the roll (engine updates state — player.position jumps to dest)
    dispatch({ type: 'ROLL_DICE', payload: { die1: d1, die2: d2 } });

    // Compute destination for animation (mirrors engine logic)
    let toPos: number;
    if (currentPlayer.inJail && d1 !== d2) {
      isMovingRef.current = false;
      setUiPhase('TURN_END');
      return;
    }
    toPos = (fromPos + d1 + d2) % BOARD_SIZE;

    // Show destination cell highlight while token walks
    setDestinationCell(toPos);

    // Brief pause after dice settle
    await sleep(350);
    if (animCancelRef.current) { isMovingRef.current = false; return; }

    // Phase: Move token step by step
    const path = buildPath(fromPos, toPos);
    if (path.length === 0) {
      isMovingRef.current = false;
      setDestinationCell(null);
      setUiPhase('ACTION_REQUIRED');
      return;
    }

    setUiPhase('MOVING');

    // Check pass-GO
    const passedGo = toPos < fromPos || (fromPos === 0 && path.length > 0);
    let goFloatShown = false;

    const stepDelay = Math.min(160, Math.floor(1800 / path.length));

    for (const pos of path) {
      if (animCancelRef.current) break;
      setAnimatedPositions((prev) => ({ ...prev, [currentPlayer.id]: pos }));
      sounds.playStep();
      if (passedGo && pos === 0 && !goFloatShown) {
        goFloatShown = true;
        addFloat('+$200', 0, '#facc15');
        sounds.playPassGo();
      }
      await sleep(stepDelay);
    }

    isMovingRef.current = false;
    setDestinationCell(null);

    if (animCancelRef.current) return;

    // Landing pulse
    setUiPhase('LANDING');
    sounds.playLanding();
    await sleep(380);
    if (animCancelRef.current) return;

    // Play jail sound if sent to jail
    const latestState = stateRef.current;
    const latestPlayer = latestState.players.find((p) => p.id === currentPlayer.id);
    if (latestPlayer?.inJail) {
      sounds.playJail();
    }

    const latestPhase = latestState.turnPhase;
    setUiPhase(
      latestPhase === 'WAITING_FOR_END_TURN' ? 'TURN_END'
      : latestPhase === 'LANDED' ? 'ACTION_REQUIRED'
      : latestPhase === 'GAME_OVER' ? 'TURN_END'
      : 'WAITING_FOR_ROLL'
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiPhase, state.players, state.currentPlayerIndex, dispatch, addFloat, sounds]);

  useEffect(() => {
    return () => { animCancelRef.current = true; };
  }, []);

  return {
    uiPhase,
    diceAnimPhase,
    diceDisplay,
    animatedPositions,
    destinationCell,
    floatingTexts,
    onRoll,
    wrappedDispatch,
    addFloat,
    cardDrawCountdown,
    endTurnCountdown,
    drawnCard,
    onDrawCard: drawCardAction,
  };
}
