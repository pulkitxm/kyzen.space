"use client";

import React, { useState } from "react";
import { TILE_BY_ID } from "../constants/board";
import type {
  Action,
  Card,
  GameState,
  Player,
  PropertyTile,
  RailroadTile,
  UtilityTile,
} from "../types";
import { GROUP_COLORS } from "./Board";
import { Dice } from "./Dice";
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
  WAITING_FOR_ROLL: { label: "Roll Dice", color: "#3b82f6" },
  ROLLING: { label: "Rolling…", color: "#a78bfa" },
  MOVING: { label: "Moving…", color: "#f97316" },
  LANDING: { label: "Landing…", color: "#fbbf24" },
  ACTION_REQUIRED: { label: "Action!", color: "#10b981" },
  TURN_END: { label: "End Turn", color: "#6b7280" },
};

function PhaseBadge({ phase }: { phase: UIPhase }) {
  const { label, color } = PHASE_LABELS[phase];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        background: `${color}18`,
        border: `1px solid ${color}55`,
        fontSize: 10,
        fontWeight: 700,
        color,
        letterSpacing: 0.5,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      {label}
    </div>
  );
}

function PlayerCard({
  player,
  isActive,
}: {
  player: Player;
  isActive: boolean;
}) {
  const netWorth =
    player.balance +
    player.ownedProperties.reduce((s, op) => {
      const tile = TILE_BY_ID[op.tileId] as
        | PropertyTile
        | RailroadTile
        | UtilityTile;
      return s + ("price" in tile ? Math.floor(tile.price * 0.5) : 0);
    }, 0);
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: isActive
          ? "color-mix(in srgb, var(--primary) 15%, transparent)"
          : "var(--surface)",
        border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "all 0.3s",
        animation: isActive ? "playerPulse 2s ease-in-out infinite" : "none",
      }}
    >
      <span style={{ fontSize: 22 }}>{player.token}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: isActive
              ? "var(--primary)"
              : player.isBankrupt
                ? "var(--muted-foreground)"
                : "var(--foreground)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {player.name} {player.isBankrupt && "💀"} {player.inJail && "🔒"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            marginTop: 1,
          }}
        >
          <span
            style={{
              color: player.balance < 0 ? "var(--danger)" : "var(--success)",
              fontWeight: 600,
            }}
          >
            ${player.balance.toLocaleString()}
          </span>{" "}
          · {player.ownedProperties.length} props
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
          Net Worth
        </div>
        <div
          style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}
        >
          ${netWorth.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled = false,
  color = "var(--primary)",
  variant = "solid",
  fullWidth = false,
}: {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  variant?: "solid" | "outline";
  fullWidth?: boolean;
}) {
  const isVar = color.startsWith("var(--");
  const foregroundColor = disabled
    ? "var(--muted-foreground)"
    : variant === "solid"
      ? color === "var(--primary)"
        ? "var(--primary-foreground)"
        : color === "var(--success)"
          ? "var(--success-foreground)"
          : color === "var(--warning)"
            ? "var(--warning-foreground)"
            : color === "var(--danger)"
              ? "var(--danger-foreground)"
              : "#fff"
      : color;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "11px 18px",
        borderRadius: 10,
        border:
          variant === "outline"
            ? `1px solid ${disabled ? "var(--border)" : `color-mix(in srgb, ${color} 40%, transparent)`}`
            : "none",
        background: disabled
          ? "var(--surface)"
          : variant === "solid"
            ? isVar
              ? color
              : `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 80%, black))`
            : `color-mix(in srgb, ${color} 10%, transparent)`,
        color: foregroundColor,
        fontWeight: 700,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

interface PendingAction {
  action: Action;
  title: string;
  details: { label: string; value: string }[];
  confirmLabel: string;
  confirmColor: string;
}

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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes confirmation dialog on click */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop closes confirmation dialog on click */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 300,
          backdropFilter: "blur(3px)",
        }}
      />
      <div
        style={{
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
        }}
      >
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
              <div
                key={d.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  background: "var(--surface)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
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
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                border: "none",
                background: pending.confirmColor,
                color: confirmTextCol,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {pending.confirmLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--muted-foreground)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
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
  state: GameState;
  dispatch: (action: Action) => void;
  onRoll: () => void;
  uiPhase: UIPhase;
  diceAnimPhase: DiceAnimPhase;
  diceDisplay: [number, number];
  cardDrawCountdown: number | null;
  endTurnCountdown: number | null;
  drawnCard: { card: Card; type: "Chance" | "CommunityChest" } | null;
  onDrawCard: () => void;
}

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
}: ControlsProps) {
  injectControlsStyle();
  const [logOpen, setLogOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const currentTile = state.board[currentPlayer.position];

  const canBuy =
    state.turnPhase === "LANDED" &&
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

  const ownedProperties = currentPlayer.ownedProperties.map((op) => ({
    op,
    tile: TILE_BY_ID[op.tileId],
  }));

  function confirmBuildHouse(tileId: string) {
    const tile = TILE_BY_ID[tileId] as PropertyTile;
    const op = currentPlayer.ownedProperties.find((o) => o.tileId === tileId);
    if (!op) return;
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
    const tile = TILE_BY_ID[tileId] as PropertyTile;
    const op = currentPlayer.ownedProperties.find((o) => o.tileId === tileId);
    if (!op) return;
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
    const tile = TILE_BY_ID[tileId] as
      | PropertyTile
      | RailroadTile
      | UtilityTile;
    const price = (tile as PropertyTile).price ?? 0;
    const mortgageVal = Math.floor(price * 0.5);
    setPending({
      action: { type: "MORTGAGE_PROPERTY", payload: { tileId } },
      title: `Mortgage ${tile.name}`,
      details: [
        { label: "Property Value", value: `$${price}` },
        { label: "Mortgage Value (50%)", value: `$${mortgageVal}` },
        {
          label: "Your Balance",
          value: `$${currentPlayer.balance.toLocaleString()}`,
        },
        { label: "Note", value: "No rent while mortgaged" },
      ],
      confirmLabel: `Mortgage for $${mortgageVal}`,
      confirmColor: "var(--danger)",
    });
  }

  function confirmUnmortgage(tileId: string) {
    const tile = TILE_BY_ID[tileId] as
      | PropertyTile
      | RailroadTile
      | UtilityTile;
    const price = (tile as PropertyTile).price ?? 0;
    const cost = Math.floor(price * 0.6);
    setPending({
      action: { type: "UNMORTGAGE_PROPERTY", payload: { tileId } },
      title: `Lift Mortgage on ${tile.name}`,
      details: [
        { label: "Property Value", value: `$${price}` },
        { label: "Cost to Unmortgage (60%)", value: `$${cost}` },
        {
          label: "Your Balance",
          value: `$${currentPlayer.balance.toLocaleString()}`,
        },
        { label: "Balance After", value: `$${currentPlayer.balance - cost}` },
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          width: 300,
          flexShrink: 0,
          fontFamily: "'Inter','Segoe UI',sans-serif",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--primary) 8%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
            animation: "slideUp 0.3s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: 1,
              }}
            >
              CURRENT TURN
            </div>
            <PhaseBadge phase={uiPhase} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>{currentPlayer.token}</span>
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--foreground)",
                }}
              >
                {currentPlayer.name}
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
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "16px",
            borderRadius: 12,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Dice values={diceDisplay} phase={diceAnimPhase} />
        </div>

        <div
          style={{
            height: 140,
            width: "100%",
            flexShrink: 0,
            position: "relative",
          }}
        >
          {drawnCard ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "var(--card)",
                border: `2px solid ${drawnCard.type === "Chance" ? "var(--warning)" : "var(--primary)"}`,
                borderRadius: 12,
                boxShadow: `0 10px 25px ${drawnCard.type === "Chance" ? "color-mix(in srgb, var(--warning) 20%, transparent)" : "color-mix(in srgb, var(--primary) 20%, transparent)"}`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                animation: "slideUp 0.3s ease",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  background:
                    drawnCard.type === "Chance"
                      ? "var(--warning)"
                      : "var(--primary)",
                  color:
                    drawnCard.type === "Chance"
                      ? "var(--warning-foreground)"
                      : "var(--primary-foreground)",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: 1,
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
              >
                {drawnCard.type === "Chance"
                  ? "❓ Chance"
                  : "🏛️ Community Chest"}
              </div>
              <div
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  lineHeight: 1.4,
                }}
              >
                {drawnCard.card.text}
              </div>
            </div>
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                boxSizing: "border-box",
                gap: 8,
              }}
            >
              {isLocked ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {uiPhase === "ROLLING" && "🎲 Shaking dice..."}
                    {uiPhase === "MOVING" && "🚶 Token walking..."}
                    {uiPhase === "LANDING" && "✨ Landing..."}
                  </div>
                  <div
                    style={{
                      width: 30,
                      height: 4,
                      background: "var(--primary)",
                      borderRadius: 2,
                      animation: "playerPulse 1.5s infinite",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  {state.turnPhase === "WAITING_FOR_ROLL" && (
                    <>
                      <button
                        type="button"
                        onClick={onRoll}
                        style={{
                          width: "100%",
                          padding: "12px 0",
                          borderRadius: 10,
                          border: "none",
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          fontWeight: 800,
                          fontSize: 14,
                          cursor: "pointer",
                          boxShadow: "0 4px 15px var(--page-ambient)",
                          transition: "all 0.2s",
                        }}
                      >
                        🎲{" "}
                        {currentPlayer.inJail
                          ? "Roll (Escape Jail)"
                          : "Roll Dice"}
                      </button>
                      {currentPlayer.inJail && (
                        <div style={{ display: "flex", gap: 8, width: "100%" }}>
                          <ActionBtn
                            label="💰 Pay $50"
                            color="var(--warning)"
                            variant="outline"
                            onClick={() => dispatch({ type: "PAY_JAIL_FINE" })}
                            disabled={currentPlayer.balance < 50}
                            fullWidth
                          />
                          {currentPlayer.outOfJailCards > 0 && (
                            <ActionBtn
                              label="🃏 Use Card"
                              color="var(--success)"
                              variant="outline"
                              onClick={() =>
                                dispatch({ type: "USE_OUT_OF_JAIL_CARD" })
                              }
                              fullWidth
                            />
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {canBuy && (
                    <>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--success)",
                          fontWeight: 700,
                          letterSpacing: 0.5,
                        }}
                      >
                        ACTION REQUIRED
                      </div>
                      <ActionBtn
                        label={`🏠 Buy ${currentTile.name} — $${(currentTile as PropertyTile).price ?? 0}`}
                        color="var(--success)"
                        onClick={() => dispatch({ type: "BUY_PROPERTY" })}
                        disabled={
                          currentPlayer.balance <
                          ((currentTile as PropertyTile).price ?? 0)
                        }
                        fullWidth
                      />
                      <ActionBtn
                        label="✗ Decline"
                        color="var(--muted-foreground)"
                        variant="outline"
                        onClick={() => dispatch({ type: "DECLINE_PURCHASE" })}
                        fullWidth
                      />
                    </>
                  )}

                  {mustDrawCard && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--warning)",
                          fontWeight: 700,
                        }}
                      >
                        CARD AVAILABLE
                      </div>
                      <button
                        type="button"
                        onClick={onDrawCard}
                        style={{
                          width: "100%",
                          padding: "10px 0",
                          borderRadius: 10,
                          border: "none",
                          background: "var(--warning)",
                          color: "var(--warning-foreground)",
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: "pointer",
                          boxShadow: "0 4px 12px var(--page-ambient)",
                        }}
                      >
                        🃏 Draw Card ({cardDrawCountdown ?? 3}s)
                      </button>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--muted-foreground)",
                          textAlign: "center",
                        }}
                      >
                        or click the deck on the board
                      </div>
                    </div>
                  )}

                  {state.turnPhase === "WAITING_FOR_END_TURN" &&
                    (currentPlayer.balance < 0 ? (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "DECLARE_BANKRUPTCY" })}
                        style={{
                          width: "100%",
                          padding: "12px 0",
                          borderRadius: 10,
                          border: "none",
                          background: "var(--danger)",
                          color: "var(--danger-foreground)",
                          fontWeight: 800,
                          fontSize: 14,
                          cursor: "pointer",
                          boxShadow: "0 4px 15px var(--page-ambient)",
                        }}
                      >
                        💀 Declare Bankruptcy
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "END_TURN" })}
                        style={{
                          width: "100%",
                          padding: "12px 0",
                          borderRadius: 10,
                          border: "none",
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          fontWeight: 800,
                          fontSize: 14,
                          cursor: "pointer",
                          boxShadow: "0 4px 15px var(--page-ambient)",
                        }}
                      >
                        ➡ End Turn ({endTurnCountdown ?? 3}s)
                      </button>
                    ))}

                  {state.turnPhase === "GAME_OVER" && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 14,
                        fontWeight: 800,
                        color: "var(--warning)",
                      }}
                    >
                      🏆 Game Over!
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            PLAYERS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {state.players.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                isActive={p.id === currentPlayer.id}
              />
            ))}
          </div>
        </div>

        {ownedProperties.length > 0 && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              YOUR PROPERTIES ({ownedProperties.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ownedProperties.map(({ op, tile }) => (
                <div
                  key={op.tileId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: op.isMortgaged
                      ? "var(--muted-foreground)"
                      : "var(--foreground)",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      flexShrink: 0,
                      background:
                        tile.type === "Property"
                          ? (GROUP_COLORS[(tile as PropertyTile).group] ??
                            "#888")
                          : "#64748b",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {op.isMortgaged && "〰 "}
                    {tile.name}
                  </span>
                  <span style={{ color: "var(--success)", fontSize: 10 }}>
                    {op.houses === 5
                      ? "🏨"
                      : op.houses > 0
                        ? `🏠×${op.houses}`
                        : ""}
                  </span>
                  {tile.type === "Property" && !op.isMortgaged && (
                    <>
                      <button
                        type="button"
                        onClick={() => confirmBuildHouse(op.tileId)}
                        style={smallBtnStyle}
                        title="Build house"
                      >
                        +
                      </button>
                      {op.houses > 0 && (
                        <button
                          type="button"
                          onClick={() => confirmSellHouse(op.tileId)}
                          style={smallBtnStyle}
                          title="Sell house"
                        >
                          −
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      op.isMortgaged
                        ? confirmUnmortgage(op.tileId)
                        : confirmMortgage(op.tileId)
                    }
                    style={{
                      ...smallBtnStyle,
                      color: op.isMortgaged
                        ? "var(--warning)"
                        : "var(--muted-foreground)",
                    }}
                    title={op.isMortgaged ? "Unmortgage" : "Mortgage"}
                  >
                    {op.isMortgaged ? "↑" : "↓"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setLogOpen((v) => !v)}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--surface)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: 1,
              }}
            >
              GAME LOG
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                transform: logOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            >
              ▾
            </span>
          </button>
          {logOpen && <GameLogList log={state.log} />}
        </div>
      </div>
    </>
  );
}

function GameLogList({ log }: { log: ReadonlyArray<string> }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);
  return (
    <div
      ref={ref}
      style={{
        maxHeight: 200,
        overflowY: "auto",
        padding: "6px 10px 8px",
        background: "var(--surface-raised)",
      }}
    >
      {log.slice(-30).map((msg, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: log items are append-only and stable
          key={i}
          style={{
            padding: "3px 0",
            borderBottom: "1px solid var(--border)",
            fontSize: 10,
            color: "var(--muted-foreground)",
            lineHeight: 1.5,
          }}
        >
          {msg}
        </div>
      ))}
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: 9,
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--muted-foreground)",
  cursor: "pointer",
  fontWeight: 700,
  flexShrink: 0,
};
