"use client";

import { TILE_BY_ID } from "@kyzen/games-core";
import type {
  Card,
  MonopolyMove,
  MonopolyState,
  PropertyTile,
  RailroadTile,
  Tile,
  UtilityTile,
} from "@kyzen/shared/types";
import type React from "react";
import { useState } from "react";
import { ActionPanel } from "./ActionPanel";
import { PlayerAvatar } from "./Board";
import { Dice } from "./Dice";
import { PlayerList } from "./PlayerList";
import { PropertyList } from "./PropertyList";
import type { DiceAnimPhase, UIPhase } from "./useGamePhase";

const CONTROLS_STYLE = `
@keyframes playerPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0); }
  50%       { box-shadow: 0 0 0 6px rgba(96,165,250,0.25); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes confirmIn {
  from { opacity: 0; transform: scale(0.92) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
`;

let styleInjected = false;
function injectControlsStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = CONTROLS_STYLE;
  document.head.appendChild(el);
}

const PHASE_LABELS: Record<UIPhase, { label: string; color: string }> = {
  WAITING_FOR_ROLL: { label: "Roll Dice", color: "var(--primary)" },
  ROLLING: { label: "Rolling…", color: "#a78bfa" },
  MOVING: { label: "Moving…", color: "#f97316" },
  LANDING: { label: "Landing…", color: "#fbbf24" },
  ACTION_REQUIRED: { label: "Action!", color: "#10b981" },
  TURN_END: { label: "End Turn", color: "#6b7280" },
};

const PHASE_BADGE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
};

function PhaseBadge({ phase }: { phase: UIPhase }) {
  const { label, color } = PHASE_LABELS[phase];
  const isVar = color.startsWith("var(--");
  return (
    <div
      style={{
        ...PHASE_BADGE_STYLE,
        background: isVar
          ? `color-mix(in srgb, ${color} 10%, transparent)`
          : `${color}18`,
        border: isVar
          ? `1px solid color-mix(in srgb, ${color} 30%, transparent)`
          : `1px solid ${color}55`,
        color,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${isVar ? "var(--primary)" : color}`,
        }}
      />
      {label}
    </div>
  );
}

interface PendingAction {
  action: MonopolyMove;
  title: string;
  details: { label: string; value: string }[];
  confirmLabel: string;
  confirmColor: string;
}

const CONFIRM_BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  zIndex: 300,
  backdropFilter: "blur(3px)",
  border: "none",
  padding: 0,
  cursor: "default",
};

const CONFIRM_DIALOG_STYLE: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%,-50%)",
  width: 300,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  zIndex: 301,
  boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
  animation: "confirmIn 0.2s ease-out",
  overflow: "hidden",
};

const CONFIRM_DETAIL_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 10px",
  background: "var(--surface)",
  borderRadius: 8,
  border: "1px solid var(--border)",
};

const CONFIRM_ACTION_BUTTON_STYLE: React.CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const CONFIRM_CANCEL_BUTTON_STYLE: React.CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--muted-foreground)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

function ConfirmDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isVar = pending.confirmColor.startsWith("var(--");
  const confirmTextCol = isVar
    ? pending.confirmColor === "var(--primary)"
      ? "var(--primary-foreground)"
      : pending.confirmColor === "var(--success)"
        ? "var(--success-foreground)"
        : pending.confirmColor === "var(--warning)"
          ? "var(--warning-foreground)"
          : "var(--danger-foreground)"
    : "#fff";

  return (
    <>
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        style={CONFIRM_BACKDROP_STYLE}
      />
      <div style={CONFIRM_DIALOG_STYLE}>
        <div style={{ height: 4, background: pending.confirmColor }} />
        <div
          style={{
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "var(--foreground)",
            }}
          >
            {pending.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pending.details.map((d) => (
              <div key={d.label} style={CONFIRM_DETAIL_ROW_STYLE}>
                <span
                  style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                >
                  {d.label}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--foreground)",
                  }}
                >
                  {d.value}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                ...CONFIRM_ACTION_BUTTON_STYLE,
                border: "none",
                background: pending.confirmColor,
                color: confirmTextCol,
              }}
            >
              {pending.confirmLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={CONFIRM_CANCEL_BUTTON_STYLE}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface ControlsProps {
  state: MonopolyState;
  dispatch: (action: MonopolyMove) => void;
  onRoll: () => void;
  uiPhase: UIPhase;
  diceAnimPhase: DiceAnimPhase;
  diceDisplay: [number, number];
  cardDrawCountdown: number | null;
  endTurnCountdown: number | null;
  drawnCard: { card: Card; type: "Chance" | "CommunityChest" } | null;
  onDrawCard: () => void;
  isMyTurn: boolean;
  turnSecondsLeft: number | null;
}

const TURN_PANEL_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "color-mix(in srgb, var(--primary) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
  animation: "slideUp 0.3s ease",
  flexShrink: 0,
};

const DICE_PANEL_STYLE: React.CSSProperties = {
  padding: "10px",
  borderRadius: 12,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  flexShrink: 0,
};

const CONTROLS_COLUMN_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: 240,
  flexShrink: 0,
  fontFamily: "'Inter','Segoe UI',sans-serif",
  height: "100%",
  paddingRight: 4,
};

export function Controls({
  state,
  dispatch,
  onRoll,
  uiPhase,
  diceAnimPhase,
  diceDisplay,
  cardDrawCountdown,
  endTurnCountdown,
  drawnCard,
  onDrawCard,
  isMyTurn,
  turnSecondsLeft,
}: ControlsProps) {
  injectControlsStyle();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) return null;
  const currentTile = state.board[currentPlayer.position];
  if (!currentTile) return null;

  const canBuy =
    state.turnPhase === "LANDED" &&
    isMyTurn &&
    (currentTile.type === "Property" ||
      currentTile.type === "Railroad" ||
      currentTile.type === "Utility") &&
    !state.players.some((p) =>
      p.ownedProperties.some((op) => op.tileId === currentTile.id),
    );

  const mustDrawCard =
    state.turnPhase === "LANDED" &&
    (currentTile.type === "Chance" || currentTile.type === "CommunityChest");

  const isLocked =
    uiPhase === "ROLLING" || uiPhase === "MOVING" || uiPhase === "LANDING";

  const ownedProperties = currentPlayer.ownedProperties
    .map((op) => ({
      op,
      tile: TILE_BY_ID[op.tileId] as Tile,
    }))
    .filter((x) => x.tile !== undefined);

  function confirmBuildHouse(tileId: string) {
    if (!isMyTurn) return;
    const tile = TILE_BY_ID[tileId] as PropertyTile;
    const op = currentPlayer?.ownedProperties.find((o) => o.tileId === tileId);
    if (!op || !currentPlayer) return;
    const nextHouses = op.houses + 1;
    const isHotel = nextHouses === 5;
    setPending({
      action: { type: "BUILD_HOUSE", payload: { tileId } },
      title: `Build ${isHotel ? "Hotel" : "House"} on ${tile.name}`,
      details: [
        {
          label: "Current Houses",
          value: `${op.houses === 5 ? "🏨 Hotel" : `🏠 × ${op.houses}`}`,
        },
        {
          label: "After Build",
          value: `${isHotel ? "🏨 Hotel" : `🏠 × ${nextHouses}`}`,
        },
        { label: "Cost", value: `$${tile.houseCost}` },
        {
          label: "Your Balance",
          value: `$${currentPlayer.balance.toLocaleString()}`,
        },
        {
          label: "Rent After",
          value: `$${tile.rent[Math.min(nextHouses, 5)]}`,
        },
      ],
      confirmLabel: `Build for $${tile.houseCost}`,
      confirmColor: "var(--success)",
    });
  }

  function confirmSellHouse(tileId: string) {
    if (!isMyTurn) return;
    const tile = TILE_BY_ID[tileId] as PropertyTile;
    const op = currentPlayer?.ownedProperties.find((o) => o.tileId === tileId);
    if (!op || !currentPlayer) return;
    const refund = Math.floor(tile.houseCost / 2);
    setPending({
      action: { type: "SELL_HOUSE", payload: { tileId } },
      title: `Sell House on ${tile.name}`,
      details: [
        { label: "Current Houses", value: `🏠 × ${op.houses}` },
        { label: "Refund", value: `$${refund}` },
        {
          label: "Your Balance",
          value: `$${currentPlayer.balance.toLocaleString()}`,
        },
      ],
      confirmLabel: `Sell for $${refund}`,
      confirmColor: "var(--warning)",
    });
  }

  function confirmMortgage(tileId: string) {
    if (!isMyTurn) return;
    const tile = TILE_BY_ID[tileId] as
      | PropertyTile
      | RailroadTile
      | UtilityTile;
    const pValue = (tile as PropertyTile).price ?? 0;
    const mortgageVal = Math.floor(pValue * 0.5);
    setPending({
      action: { type: "MORTGAGE_PROPERTY", payload: { tileId } },
      title: `Mortgage ${tile.name}`,
      details: [
        { label: "Property Value", value: `$${pValue}` },
        { label: "Mortgage Value (50%)", value: `$${mortgageVal}` },
        {
          label: "Your Balance",
          value: `$${currentPlayer?.balance.toLocaleString() ?? "0"}`,
        },
        { label: "Note", value: "No rent while mortgaged" },
      ],
      confirmLabel: `Mortgage for $${mortgageVal}`,
      confirmColor: "var(--danger)",
    });
  }

  function confirmUnmortgage(tileId: string) {
    if (!isMyTurn) return;
    const tile = TILE_BY_ID[tileId] as
      | PropertyTile
      | RailroadTile
      | UtilityTile;
    const pValue = (tile as PropertyTile).price ?? 0;
    const cost = Math.floor(pValue * 0.6);
    setPending({
      action: { type: "UNMORTGAGE_PROPERTY", payload: { tileId } },
      title: `Lift Mortgage on ${tile.name}`,
      details: [
        { label: "Property Value", value: `$${pValue}` },
        { label: "Cost to Unmortgage (60%)", value: `$${cost}` },
        {
          label: "Your Balance",
          value: `$${currentPlayer?.balance.toLocaleString() ?? "0"}`,
        },
        {
          label: "Balance After",
          value: `$${(currentPlayer?.balance ?? 0) - cost}`,
        },
      ],
      confirmLabel: `Pay $${cost} to Unmortgage`,
      confirmColor: "var(--success)",
    });
  }

  return (
    <>
      {pending && (
        <ConfirmDialog
          pending={pending}
          onConfirm={() => {
            dispatch(pending.action);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}

      <div style={CONTROLS_COLUMN_STYLE}>
        <div style={TURN_PANEL_STYLE}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                letterSpacing: 1,
              }}
            >
              CURRENT TURN
            </div>
            <PhaseBadge phase={uiPhase} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PlayerAvatar username={currentPlayer.name} size={24} />
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--foreground)",
                }}
              >
                {currentPlayer.name} {isMyTurn && "(You)"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  marginTop: 1,
                }}
              >
                <span style={{ color: "var(--success)", fontWeight: 600 }}>
                  ${currentPlayer.balance.toLocaleString()}
                </span>
                {" · "}
                {currentTile.name}
                {state.doublesCount > 0 && (
                  <span style={{ color: "var(--primary)" }}>
                    {" "}
                    · 🎯 ×{state.doublesCount}
                  </span>
                )}
                {currentPlayer.inJail && (
                  <span style={{ color: "var(--danger)" }}> · In Jail</span>
                )}
              </div>
              {turnSecondsLeft !== null && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 750,
                    color:
                      turnSecondsLeft <= 5 ? "var(--danger)" : "var(--warning)",
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>⏱️ {turnSecondsLeft}s left</span>
                  {currentPlayer.consecutiveTimeouts > 0 && (
                    <span style={{ color: "var(--danger)", fontSize: 12 }}>
                      (Warning: Try #{currentPlayer.consecutiveTimeouts + 1})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={DICE_PANEL_STYLE}>
          <Dice values={diceDisplay} phase={diceAnimPhase} />
        </div>

        <div
          style={{
            height: 120,
            width: "100%",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <ActionPanel
            state={state}
            dispatch={dispatch}
            onRoll={onRoll}
            uiPhase={uiPhase}
            isLocked={isLocked}
            drawnCard={drawnCard}
            onDrawCard={onDrawCard}
            cardDrawCountdown={cardDrawCountdown}
            endTurnCountdown={endTurnCountdown}
            isMyTurn={isMyTurn}
            currentPlayer={currentPlayer}
            currentTile={currentTile}
            canBuy={canBuy}
            mustDrawCard={mustDrawCard}
          />
        </div>

        <PlayerList
          players={state.players}
          currentPlayerId={currentPlayer.id}
        />

        {ownedProperties.length > 0 && (
          <PropertyList
            ownedProperties={ownedProperties}
            board={state.board}
            currentPlayer={currentPlayer}
            isMyTurn={isMyTurn}
            onBuildHouse={confirmBuildHouse}
            onSellHouse={confirmSellHouse}
            onMortgage={confirmMortgage}
            onUnmortgage={confirmUnmortgage}
          />
        )}
      </div>
    </>
  );
}
