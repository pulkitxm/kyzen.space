"use client";

import { TILE_BY_ID } from "@kyzen/games-core";
import type {
  Player,
  PropertyTile,
  RailroadTile,
  UtilityTile,
} from "@kyzen/shared/types";
import type React from "react";
import { PlayerAvatar } from "./Board";

const PLAYER_CARD_STYLE: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  gap: 8,
  transition:
    "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
};

const PLAYER_NAME_STYLE: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

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
      return s + (tile && "price" in tile ? Math.floor(tile.price * 0.5) : 0);
    }, 0);
  return (
    <div
      style={{
        ...PLAYER_CARD_STYLE,
        background: isActive
          ? "color-mix(in srgb, var(--primary) 15%, transparent)"
          : "var(--surface)",
        border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
        animation: isActive ? "playerPulse 2s ease-in-out infinite" : "none",
      }}
    >
      <PlayerAvatar
        username={player.name}
        size={24}
        className={
          isActive ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
        }
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...PLAYER_NAME_STYLE,
            color: isActive
              ? "var(--primary)"
              : player.isBankrupt
                ? "var(--muted-foreground)"
                : "var(--foreground)",
          }}
        >
          {player.name} {player.isBankrupt && "💀"} {player.inJail && "🔒"}
        </div>
        <div
          style={{
            fontSize: 12,
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
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
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

export function PlayerList({
  players,
  currentPlayerId,
}: {
  players: Player[];
  currentPlayerId: string;
}) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted-foreground)",
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        PLAYERS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {players.map((p) => (
          <PlayerCard
            key={p.id}
            player={p}
            isActive={p.id === currentPlayerId}
          />
        ))}
      </div>
    </div>
  );
}
