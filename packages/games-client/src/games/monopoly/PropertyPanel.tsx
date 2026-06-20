"use client";

import type {
  MonopolyMove,
  MonopolyState,
  Player,
  PropertyTile,
  RailroadTile,
  Tile,
  UtilityTile,
} from "@kyzen/shared/types";
import type React from "react";
import { GROUP_COLORS } from "./board-constants";

const BUTTON_RESET: React.CSSProperties = {
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "inherit",
  cursor: "pointer",
  boxSizing: "border-box",
};

const RENT_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 6,
  transition: "background 0.2s, border-color 0.2s",
};

const BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 200,
  backdropFilter: "blur(2px)",
};

const BUY_BUTTON_STYLE: React.CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  fontSize: 13,
};

const SKIP_BUTTON_STYLE: React.CSSProperties = {
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

const PANEL_STYLE = `
@keyframes panelSlideIn {
  from { opacity: 0; transform: translateX(32px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes cardFlipIn {
  from { opacity: 0; transform: rotateY(90deg) scale(0.92); }
  to   { opacity: 1; transform: rotateY(0deg) scale(1); }
}
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = PANEL_STYLE;
  document.head.appendChild(el);
}

function RentRow({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        ...RENT_ROW_STYLE,
        background: highlight
          ? "color-mix(in srgb, var(--primary) 15%, transparent)"
          : "transparent",
        border: highlight
          ? "1px solid color-mix(in srgb, var(--primary) 40%, transparent)"
          : "1px solid transparent",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: highlight ? "var(--primary)" : "var(--muted-foreground)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: highlight ? "var(--primary)" : "var(--foreground)",
        }}
      >
        ${amount}
      </span>
    </div>
  );
}

interface PropertyPanelProps {
  tile: Tile;
  state: MonopolyState;
  dispatch: (a: MonopolyMove) => void;
  onClose: () => void;
}

function ownerOf(state: MonopolyState, tileId: string): Player | undefined {
  return state.players.find((p) =>
    p.ownedProperties.some((op) => op.tileId === tileId),
  );
}

export function PropertyPanel({
  tile,
  state,
  dispatch,
  onClose,
}: PropertyPanelProps) {
  injectStyle();

  const currentPlayer = state.players[state.currentPlayerIndex];
  const owner = ownerOf(state, tile.id);
  const isOwned = !!owner;
  const isCurrentPlayerOwner = owner?.id === currentPlayer?.id;
  const ownedProp = owner?.ownedProperties.find((op) => op.tileId === tile.id);

  const canBuy =
    state.turnPhase === "LANDED" &&
    currentPlayer &&
    currentPlayer.position === tile.position &&
    !isOwned &&
    (tile.type === "Property" ||
      tile.type === "Railroad" ||
      tile.type === "Utility");

  const price = (tile as PropertyTile | RailroadTile | UtilityTile).price ?? 0;
  const groupColor =
    tile.type === "Property"
      ? (GROUP_COLORS[(tile as PropertyTile).group] ?? "#888")
      : tile.type === "Railroad"
        ? GROUP_COLORS.Railroad
        : tile.type === "Utility"
          ? GROUP_COLORS.Utility
          : "#888";

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        style={{ ...BUTTON_RESET, ...BACKDROP_STYLE }}
      />
      <div
        style={{
          position: "fixed",
          right: 16,
          top: "50%",
          transform: "translateY(-50%)",
          width: 300,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          zIndex: 201,
          boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
          animation: "panelSlideIn 0.25s ease-out",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 8,
            background: groupColor,
          }}
        />

        <div
          style={{
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: "var(--foreground)",
                  lineHeight: 1.2,
                }}
              >
                {tile.name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  marginTop: 2,
                }}
              >
                {tile.type === "Property"
                  ? `${(tile as PropertyTile).group} Group`
                  : tile.type}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted-foreground)",
                cursor: "pointer",
                fontSize: 18,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {price > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: "var(--surface)",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Purchase Price
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--warning)",
                }}
              >
                ${price}
              </span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "var(--surface)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            {isOwned ? (
              <>
                <span style={{ fontSize: 18 }}>{owner?.token}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                  >
                    Owned by
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: isCurrentPlayerOwner
                        ? "var(--success)"
                        : "var(--danger)",
                    }}
                  >
                    {owner?.name} {isCurrentPlayerOwner && "(You)"}
                  </div>
                </div>
                {ownedProp?.isMortgaged && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--danger)",
                      background:
                        "color-mix(in srgb, var(--danger) 15%, transparent)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    MORTGAGED
                  </span>
                )}
                {ownedProp && ownedProp.houses > 0 && (
                  <span style={{ fontSize: 13 }}>
                    {ownedProp.houses === 5 ? "🏨" : `🏠×${ownedProp.houses}`}
                  </span>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                🏦 Bank - Available
              </div>
            )}
          </div>

          {tile.type === "Property" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                RENT TIERS
              </div>
              <RentRow
                label="Base Rent"
                amount={(tile as PropertyTile).rent[0]}
                highlight={!ownedProp || ownedProp.houses === 0}
              />
              <RentRow
                label="1 House"
                amount={(tile as PropertyTile).rent[1]}
                highlight={ownedProp?.houses === 1}
              />
              <RentRow
                label="2 Houses"
                amount={(tile as PropertyTile).rent[2]}
                highlight={ownedProp?.houses === 2}
              />
              <RentRow
                label="3 Houses"
                amount={(tile as PropertyTile).rent[3]}
                highlight={ownedProp?.houses === 3}
              />
              <RentRow
                label="4 Houses"
                amount={(tile as PropertyTile).rent[4]}
                highlight={ownedProp?.houses === 4}
              />
              <RentRow
                label="Hotel 🏨"
                amount={(tile as PropertyTile).rent[5]}
                highlight={ownedProp?.houses === 5}
              />
            </div>
          )}

          {tile.type === "Railroad" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                RENT BY RAILROADS OWNED
              </div>
              {[1, 2, 3, 4].map((n) => (
                <RentRow
                  key={n}
                  label={`${n} Railroad${n > 1 ? "s" : ""}`}
                  amount={(tile as RailroadTile).rent[n] ?? 0}
                />
              ))}
            </div>
          )}

          {canBuy && currentPlayer && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "BUY_PROPERTY" });
                  onClose();
                }}
                disabled={currentPlayer.balance < price}
                style={{
                  ...BUY_BUTTON_STYLE,
                  background:
                    currentPlayer.balance < price
                      ? "var(--surface-hover)"
                      : "var(--success)",
                  color:
                    currentPlayer.balance < price
                      ? "var(--muted-foreground)"
                      : "var(--success-foreground)",
                  cursor:
                    currentPlayer.balance < price ? "not-allowed" : "pointer",
                }}
              >
                Buy ${price}
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "DECLINE_PURCHASE" });
                  onClose();
                }}
                style={SKIP_BUTTON_STYLE}
              >
                Skip
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
