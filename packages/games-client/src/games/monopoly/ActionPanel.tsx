"use client";

import type {
  Card,
  MonopolyMove,
  MonopolyState,
  Player,
  PropertyTile,
  Tile,
} from "@kyzen/shared/types";
import type React from "react";
import { ActionBtn } from "./ActionBtn";
import type { UIPhase } from "./useGamePhase";

const DRAWN_CARD_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--card)",
  borderRadius: 12,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  animation: "slideUp 0.3s ease",
  boxSizing: "border-box",
};

const CARD_HEADER_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1,
  textAlign: "center",
  textTransform: "uppercase",
};

const ACTION_SHELL_STYLE: React.CSSProperties = {
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
};

const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 8,
  border: "none",
  fontWeight: 800,
  fontSize: 12,
  transition: "transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
};

interface ActionPanelProps {
  state: MonopolyState;
  dispatch: (action: MonopolyMove) => void;
  onRoll: () => void;
  uiPhase: UIPhase;
  isLocked: boolean;
  drawnCard: { card: Card; type: "Chance" | "CommunityChest" } | null;
  onDrawCard: () => void;
  cardDrawCountdown: number | null;
  endTurnCountdown: number | null;
  isMyTurn: boolean;
  currentPlayer: Player;
  currentTile: Tile;
  canBuy: boolean;
  mustDrawCard: boolean;
}

export function ActionPanel({
  state,
  dispatch,
  onRoll,
  uiPhase,
  isLocked,
  drawnCard,
  onDrawCard,
  cardDrawCountdown,
  endTurnCountdown,
  isMyTurn,
  currentPlayer,
  currentTile,
  canBuy,
  mustDrawCard,
}: ActionPanelProps) {
  if (drawnCard) {
    return (
      <div
        style={{
          ...DRAWN_CARD_STYLE,
          border: `2px solid ${drawnCard.type === "Chance" ? "var(--warning)" : "var(--primary)"}`,
          boxShadow: `0 10px 25px ${drawnCard.type === "Chance" ? "color-mix(in srgb, var(--warning) 20%, transparent)" : "color-mix(in srgb, var(--primary) 20%, transparent)"}`,
        }}
      >
        <div
          style={{
            ...CARD_HEADER_STYLE,
            background:
              drawnCard.type === "Chance" ? "var(--warning)" : "var(--primary)",
            color:
              drawnCard.type === "Chance"
                ? "var(--warning-foreground)"
                : "var(--primary-foreground)",
          }}
        >
          {drawnCard.type === "Chance" ? "❓ Chance" : "🏛️ Community Chest"}
        </div>
        <div
          style={{
            flex: 1,
            padding: "8px 10px",
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
    );
  }

  return (
    <div style={ACTION_SHELL_STYLE}>
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
                disabled={!isMyTurn}
                style={{
                  ...PRIMARY_BUTTON_STYLE,
                  background: isMyTurn
                    ? "var(--primary)"
                    : "var(--surface-hover)",
                  color: isMyTurn
                    ? "var(--primary-foreground)"
                    : "var(--muted-foreground)",
                  cursor: isMyTurn ? "pointer" : "not-allowed",
                  boxShadow: isMyTurn
                    ? "0 4px 15px var(--page-ambient)"
                    : "none",
                }}
              >
                🎲 {currentPlayer.inJail ? "Roll (Escape Jail)" : "Roll Dice"}
              </button>
              {currentPlayer.inJail && (
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <ActionBtn
                    label="💰 Pay $50"
                    color="var(--warning)"
                    variant="outline"
                    onClick={() => dispatch({ type: "PAY_JAIL_FINE" })}
                    disabled={!isMyTurn || currentPlayer.balance < 50}
                    fullWidth
                  />
                  {currentPlayer.outOfJailCards > 0 && (
                    <ActionBtn
                      label="🃏 Use Card"
                      color="var(--success)"
                      variant="outline"
                      onClick={() => dispatch({ type: "USE_OUT_OF_JAIL_CARD" })}
                      disabled={!isMyTurn}
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
                  fontSize: 12,
                  color: "var(--success)",
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                ACTION REQUIRED
              </div>
              <ActionBtn
                label={`🏠 Buy ${currentTile.name} - $${(currentTile as PropertyTile).price ?? 0}`}
                color="var(--success)"
                onClick={() => dispatch({ type: "BUY_PROPERTY" })}
                disabled={
                  !isMyTurn ||
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
                disabled={!isMyTurn}
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
                  fontSize: 12,
                  color: "var(--warning)",
                  fontWeight: 700,
                }}
              >
                CARD AVAILABLE
              </div>
              <button
                type="button"
                onClick={onDrawCard}
                disabled={!isMyTurn}
                style={{
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 8,
                  border: "none",
                  background: isMyTurn
                    ? "var(--warning)"
                    : "var(--surface-hover)",
                  color: isMyTurn
                    ? "var(--warning-foreground)"
                    : "var(--muted-foreground)",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: isMyTurn ? "pointer" : "not-allowed",
                  boxShadow: isMyTurn
                    ? "0 4px 12px var(--page-ambient)"
                    : "none",
                }}
              >
                🃏 Draw Card ({cardDrawCountdown ?? 3}s)
              </button>
              <div
                style={{
                  fontSize: 12,
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
                disabled={!isMyTurn}
                style={{
                  ...PRIMARY_BUTTON_STYLE,
                  background: isMyTurn
                    ? "var(--danger)"
                    : "var(--surface-hover)",
                  color: isMyTurn
                    ? "var(--danger-foreground)"
                    : "var(--muted-foreground)",
                  cursor: isMyTurn ? "pointer" : "not-allowed",
                  boxShadow: isMyTurn
                    ? "0 4px 15px var(--page-ambient)"
                    : "none",
                }}
              >
                💀 Declare Bankruptcy
              </button>
            ) : (
              <button
                type="button"
                onClick={() => dispatch({ type: "END_TURN" })}
                disabled={!isMyTurn}
                style={{
                  ...PRIMARY_BUTTON_STYLE,
                  background: isMyTurn
                    ? "var(--primary)"
                    : "var(--surface-hover)",
                  color: isMyTurn
                    ? "var(--primary-foreground)"
                    : "var(--muted-foreground)",
                  cursor: isMyTurn ? "pointer" : "not-allowed",
                  boxShadow: isMyTurn
                    ? "0 4px 15px var(--page-ambient)"
                    : "none",
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
  );
}
