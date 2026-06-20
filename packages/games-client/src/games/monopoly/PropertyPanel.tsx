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
import { PropertyActions } from "./PropertyActions";
import { PropertyOwnership } from "./PropertyOwnership";
import { PropertyPanelHeader } from "./PropertyPanelHeader";
import { PropertyRentTables } from "./PropertyRentTables";

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

const BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 200,
  backdropFilter: "blur(2px)",
};

const PANEL_CONTAINER_STYLE: React.CSSProperties = {
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
        aria-label="Close property panel"
        onClick={onClose}
        style={{ ...BUTTON_RESET, ...BACKDROP_STYLE }}
      />
      <div style={PANEL_CONTAINER_STYLE}>
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
          <PropertyPanelHeader tile={tile} onClose={onClose} />

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

          <PropertyOwnership
            isOwned={isOwned}
            owner={owner}
            isCurrentPlayerOwner={isCurrentPlayerOwner}
            ownedProp={ownedProp}
          />

          <PropertyRentTables tile={tile} ownedProp={ownedProp} />

          {canBuy && currentPlayer && (
            <PropertyActions
              currentPlayer={currentPlayer}
              price={price}
              dispatch={dispatch}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}
