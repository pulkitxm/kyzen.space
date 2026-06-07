"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_SIZE } from "../constants/board";
import type { Action, Card, GameState } from "../types";
import { useSound } from "./useSound";

export type UIPhase =
  | "WAITING_FOR_ROLL"
  | "ROLLING"
  | "MOVING"
  | "LANDING"
  | "ACTION_REQUIRED"
  | "TURN_END";

export type DiceAnimPhase =
  | "idle"
  | "shaking"
  | "rolling"
  | "settling"
  | "settled";

export interface FloatingText {
  id: string;
  text: string;
  col: number;
  row: number;
  color: string;
}

export function positionToCell(pos: number): [number, number] {
  if (pos === 0) return [8, 8];
  if (pos <= 7) return [8, 8 - pos];
  if (pos === 8) return [8, 0];
  if (pos <= 15) return [8 - (pos - 8), 0];
  if (pos === 16) return [0, 0];
  if (pos <= 23) return [0, pos - 16];
  if (pos === 24) return [0, 8];
  if (pos <= 31) return [pos - 24, 8];
  return [8, 8];
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
function nextFloatId() {
  return String(++_floatId);
}

export function useGamePhase(state: GameState, dispatch: (a: Action) => void) {
  const sounds = useSound();

  const [uiPhase, setUiPhase] = useState<UIPhase>("WAITING_FOR_ROLL");
  const stateRef = useRef<GameState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [diceAnimPhase, setDiceAnimPhase] = useState<DiceAnimPhase>("idle");
  const [diceDisplay, setDiceDisplay] = useState<[number, number]>([1, 1]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  const [cardDrawCountdown, setCardDrawCountdown] = useState<number | null>(
    null,
  );
  const [endTurnCountdown, setEndTurnCountdown] = useState<number | null>(null);
  const [drawnCard, setDrawnCard] = useState<{
    card: Card;
    type: "Chance" | "CommunityChest";
  } | null>(null);

  const [animatedPositions, setAnimatedPositions] = useState<
    Record<string, number>
  >(() => {
    const m: Record<string, number> = {};
    state.players.forEach((p) => {
      m[p.id] = p.position;
    });
    return m;
  });

  const [destinationCell, setDestinationCell] = useState<number | null>(null);

  const animCancelRef = useRef(false);
  const isMovingRef = useRef(false);

  useEffect(() => {
    if (!isMovingRef.current) {
      setAnimatedPositions((prev) => {
        const next = { ...prev };
        state.players.forEach((p) => {
          next[p.id] = p.position;
        });
        return next;
      });
    }
  }, [state.players]);

  const removeFloat = useCallback((id: string) => {
    setFloatingTexts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addFloat = useCallback(
    (text: string, position: number, color: string) => {
      const [row, col] = positionToCell(position);
      const id = nextFloatId();
      setFloatingTexts((prev) => [...prev, { id, text, col, row, color }]);
      setTimeout(() => removeFloat(id), 1800);
    },
    [removeFloat],
  );

  useEffect(() => {
    if (isMovingRef.current) return;
    if (state.turnPhase === "GAME_OVER") {
      setUiPhase("TURN_END");
      return;
    }
    if (uiPhase === "ROLLING" || uiPhase === "MOVING" || uiPhase === "LANDING")
      return;
    if (state.turnPhase === "WAITING_FOR_ROLL") setUiPhase("WAITING_FOR_ROLL");
    else if (state.turnPhase === "LANDED") setUiPhase("ACTION_REQUIRED");
    else if (state.turnPhase === "WAITING_FOR_END_TURN") setUiPhase("TURN_END");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnPhase]);

  const balanceSnapshotRef = useRef<Record<string, number>>({});
  const positionSnapshotRef = useRef<Record<string, number>>({});

  const wrappedDispatch = useCallback(
    (action: Action) => {
      const prevBalances: Record<string, number> = {};
      stateRef.current.players.forEach((p) => {
        prevBalances[p.id] = p.balance;
      });
      const prevPositions: Record<string, number> = {};
      stateRef.current.players.forEach((p) => {
        prevPositions[p.id] = p.position;
      });

      if (action.type === "BUY_PROPERTY") sounds.playBuy();
      else if (action.type === "DRAW_CARD") sounds.playCardDraw();
      else if (action.type === "DECLARE_BANKRUPTCY") sounds.playJail();

      dispatch(action);
      balanceSnapshotRef.current = prevBalances;
      positionSnapshotRef.current = prevPositions;
    },
    [dispatch, sounds],
  );

  useEffect(() => {
    const prev = balanceSnapshotRef.current;
    if (!Object.keys(prev).length) return;
    state.players.forEach((p) => {
      const diff = p.balance - (prev[p.id] ?? p.balance);
      if (diff !== 0 && !isMovingRef.current) {
        const color = diff > 0 ? "#4ade80" : "#f87171";
        addFloat(
          diff > 0 ? `+$${diff}` : `-$${Math.abs(diff)}`,
          p.position,
          color,
        );
        if (diff < 0) {
          const _currentAction = balanceSnapshotRef.current;
        }
      }
    });
    balanceSnapshotRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players]);

  const drawCardAction = useCallback(() => {
    if (drawnCard || isMovingRef.current) return;
    const player =
      stateRef.current.players[stateRef.current.currentPlayerIndex];
    if (!player) return;
    const tile = stateRef.current.board[player.position];
    if (tile.type !== "Chance" && tile.type !== "CommunityChest") return;

    const deck =
      tile.type === "Chance"
        ? stateRef.current.chanceDeck
        : stateRef.current.communityDeck;
    const topCard = deck[0];
    if (!topCard) return;

    setDrawnCard({ card: topCard, type: tile.type });
    setCardDrawCountdown(null);
    sounds.playCardDraw();

    setTimeout(() => {
      dispatch({ type: "DRAW_CARD" });
      setDrawnCard(null);
    }, 2000);
  }, [dispatch, sounds, drawnCard]);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const currentTile = currentPlayer
    ? state.board[currentPlayer.position]
    : null;
  const mustDrawCard =
    state.turnPhase === "LANDED" &&
    (currentTile?.type === "Chance" || currentTile?.type === "CommunityChest");

  useEffect(() => {
    if (mustDrawCard && !drawnCard && uiPhase === "ACTION_REQUIRED") {
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

  useEffect(() => {
    if (state.turnPhase === "WAITING_FOR_END_TURN" && uiPhase === "TURN_END") {
      let count = 3;
      setEndTurnCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(timer);
          setEndTurnCountdown(null);
          wrappedDispatch({ type: "END_TURN" });
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

  const onRoll = useCallback(async () => {
    if (uiPhase !== "WAITING_FOR_ROLL") return;
    if (state.turnPhase !== "WAITING_FOR_ROLL") return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const currentPlayer = state.players[state.currentPlayerIndex];
    const fromPos = currentPlayer.position;

    animCancelRef.current = false;

    setUiPhase("ROLLING");
    setDiceAnimPhase("shaking");
    setDiceDisplay([d1, d2]);
    sounds.playDiceRoll();
    await sleep(400);
    if (animCancelRef.current) return;

    setDiceAnimPhase("rolling");
    await sleep(600);
    if (animCancelRef.current) return;

    setDiceAnimPhase("settling");
    await sleep(300);
    if (animCancelRef.current) return;
    setDiceAnimPhase("settled");

    isMovingRef.current = true;

    dispatch({ type: "ROLL_DICE", payload: { die1: d1, die2: d2 } });

    if (currentPlayer.inJail && d1 !== d2) {
      isMovingRef.current = false;
      setUiPhase("TURN_END");
      return;
    }
    const toPos = (fromPos + d1 + d2) % BOARD_SIZE;

    setDestinationCell(toPos);

    await sleep(350);
    if (animCancelRef.current) {
      isMovingRef.current = false;
      return;
    }

    const path = buildPath(fromPos, toPos);
    if (path.length === 0) {
      isMovingRef.current = false;
      setDestinationCell(null);
      setUiPhase("ACTION_REQUIRED");
      return;
    }

    setUiPhase("MOVING");

    const passedGo = toPos < fromPos || (fromPos === 0 && path.length > 0);
    let goFloatShown = false;

    const stepDelay = Math.min(160, Math.floor(1800 / path.length));

    for (const pos of path) {
      if (animCancelRef.current) break;
      setAnimatedPositions((prev) => ({ ...prev, [currentPlayer.id]: pos }));
      sounds.playStep();
      if (passedGo && pos === 0 && !goFloatShown) {
        goFloatShown = true;
        addFloat("+$200", 0, "#facc15");
        sounds.playPassGo();
      }
      await sleep(stepDelay);
    }

    isMovingRef.current = false;
    setDestinationCell(null);

    if (animCancelRef.current) return;

    setUiPhase("LANDING");
    sounds.playLanding();
    await sleep(380);
    if (animCancelRef.current) return;

    const latestState = stateRef.current;
    const latestPlayer = latestState.players.find(
      (p) => p.id === currentPlayer.id,
    );
    if (latestPlayer?.inJail) {
      sounds.playJail();
    }

    const latestPhase = latestState.turnPhase;
    setUiPhase(
      latestPhase === "WAITING_FOR_END_TURN"
        ? "TURN_END"
        : latestPhase === "LANDED"
          ? "ACTION_REQUIRED"
          : latestPhase === "GAME_OVER"
            ? "TURN_END"
            : "WAITING_FOR_ROLL",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uiPhase,
    state.players,
    state.currentPlayerIndex,
    dispatch,
    addFloat,
    sounds,
  ]);

  useEffect(() => {
    return () => {
      animCancelRef.current = true;
    };
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
