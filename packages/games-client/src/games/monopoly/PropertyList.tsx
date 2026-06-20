"use client";

import type { Player, PropertyTile, Tile } from "@kyzen/shared/types";
import type React from "react";
import { FaLock, FaMinus, FaPlus, FaUnlock } from "react-icons/fa6";
import { GROUP_COLORS } from "./board-constants";

const actionBtnStyle: React.CSSProperties = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  padding: "4px 6px",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--muted-foreground)",
  cursor: "pointer",
  transition:
    "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
};

const PROPERTY_CARD_STYLE: React.CSSProperties = {
  padding: "8px",
  borderRadius: 8,
  background: "var(--card)",
  border: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
};

const BADGE_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  padding: "1px 4px",
  borderRadius: 4,
  textTransform: "uppercase",
};

interface OwnedProperty {
  op: Player["ownedProperties"][number];
  tile: Tile;
}

interface PropertyListProps {
  ownedProperties: OwnedProperty[];
  board: Tile[];
  currentPlayer: Player;
  isMyTurn: boolean;
  onBuildHouse: (tileId: string) => void;
  onSellHouse: (tileId: string) => void;
  onMortgage: (tileId: string) => void;
  onUnmortgage: (tileId: string) => void;
}

export function PropertyList({
  ownedProperties,
  board,
  currentPlayer,
  isMyTurn,
  onBuildHouse,
  onSellHouse,
  onMortgage,
  onUnmortgage,
}: PropertyListProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--muted-foreground)",
          letterSpacing: 1,
          marginBottom: 6,
          flexShrink: 0,
        }}
      >
        YOUR PROPERTIES ({ownedProperties.length})
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
        {ownedProperties.map(({ op, tile }) => {
          const groupColor =
            tile.type === "Property"
              ? (GROUP_COLORS[(tile as PropertyTile).group] ?? "#888")
              : tile.type === "Railroad"
                ? GROUP_COLORS.Railroad
                : tile.type === "Utility"
                  ? GROUP_COLORS.Utility
                  : "#888";

          return (
            <div key={op.tileId} style={PROPERTY_CARD_STYLE}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    flexShrink: 0,
                    background: groupColor,
                    border: "1px solid var(--border-muted)",
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 700,
                    color: op.isMortgaged
                      ? "var(--muted-foreground)"
                      : "var(--foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tile.name}
                </span>
                {op.isMortgaged ? (
                  <span
                    style={{
                      ...BADGE_STYLE,
                      background:
                        "color-mix(in srgb, var(--danger) 15%, transparent)",
                      color: "var(--danger)",
                    }}
                  >
                    Mtg
                  </span>
                ) : (
                  op.houses > 0 && (
                    <span
                      style={{
                        ...BADGE_STYLE,
                        background:
                          "color-mix(in srgb, var(--success) 15%, transparent)",
                        color: "var(--success)",
                      }}
                    >
                      {op.houses === 5 ? "🏨 Hotel" : `🏠 ×${op.houses}`}
                    </span>
                  )
                )}
              </div>

              {isMyTurn && (
                <div style={{ display: "flex", gap: 4 }}>
                  {tile.type === "Property" &&
                    !op.isMortgaged &&
                    (() => {
                      const propTile = tile as PropertyTile;
                      const groupProps = board.filter(
                        (t) =>
                          t.type === "Property" &&
                          (t as PropertyTile).group === propTile.group,
                      ) as PropertyTile[];
                      const ownedInGroup = currentPlayer.ownedProperties.filter(
                        (o) => groupProps.some((gp) => gp.id === o.tileId),
                      );
                      const ownsFullGroup =
                        ownedInGroup.length === groupProps.length;
                      const hasHotel = op.houses >= 5;
                      const canAfford =
                        currentPlayer.balance >= propTile.houseCost;
                      const buildDisabled =
                        !ownsFullGroup || hasHotel || !canAfford;

                      let buildTitle = "Build house/hotel";
                      if (hasHotel) {
                        buildTitle = "Already built a hotel";
                      } else if (!ownsFullGroup) {
                        buildTitle = `Requires owning all properties in the ${propTile.group} group (${ownedInGroup.length}/${groupProps.length})`;
                      } else if (!canAfford) {
                        buildTitle = `Insufficient funds (costs $${propTile.houseCost})`;
                      }

                      return (
                        <>
                          <button
                            type="button"
                            disabled={buildDisabled}
                            onClick={() => onBuildHouse(op.tileId)}
                            style={{
                              ...actionBtnStyle,
                              opacity: buildDisabled ? 0.5 : 1,
                              cursor: buildDisabled ? "not-allowed" : "pointer",
                            }}
                            title={buildTitle}
                          >
                            <FaPlus size={8} /> House
                          </button>
                          {op.houses > 0 && (
                            <button
                              type="button"
                              onClick={() => onSellHouse(op.tileId)}
                              style={actionBtnStyle}
                              title="Sell house/hotel"
                            >
                              <FaMinus size={8} /> House
                            </button>
                          )}
                        </>
                      );
                    })()}
                  <button
                    type="button"
                    disabled={!op.isMortgaged && op.houses > 0}
                    onClick={() =>
                      op.isMortgaged
                        ? onUnmortgage(op.tileId)
                        : onMortgage(op.tileId)
                    }
                    style={{
                      ...actionBtnStyle,
                      color: op.isMortgaged
                        ? "var(--success)"
                        : !op.isMortgaged && op.houses > 0
                          ? "var(--muted-foreground)"
                          : "var(--danger)",
                      borderColor: op.isMortgaged
                        ? "color-mix(in srgb, var(--success) 30%, transparent)"
                        : !op.isMortgaged && op.houses > 0
                          ? "var(--border)"
                          : "color-mix(in srgb, var(--danger) 30%, transparent)",
                      background: op.isMortgaged
                        ? "color-mix(in srgb, var(--success) 8%, transparent)"
                        : !op.isMortgaged && op.houses > 0
                          ? "var(--surface)"
                          : "color-mix(in srgb, var(--danger) 8%, transparent)",
                      opacity: !op.isMortgaged && op.houses > 0 ? 0.5 : 1,
                      cursor:
                        !op.isMortgaged && op.houses > 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                    title={
                      !op.isMortgaged && op.houses > 0
                        ? "Must sell houses before mortgaging"
                        : op.isMortgaged
                          ? "Lift mortgage"
                          : "Mortgage property"
                    }
                  >
                    {op.isMortgaged ? (
                      <FaUnlock size={8} />
                    ) : (
                      <FaLock size={8} />
                    )}
                    {op.isMortgaged ? "Unmortgage" : "Mortgage"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
