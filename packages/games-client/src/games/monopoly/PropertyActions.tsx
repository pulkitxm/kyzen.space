"use client";

import type { MonopolyMove, Player } from "@kyzen/shared/types";
import type React from "react";

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

export function PropertyActions({
  currentPlayer,
  price,
  dispatch,
  onClose,
}: {
  currentPlayer: Player;
  price: number;
  dispatch: (a: MonopolyMove) => void;
  onClose: () => void;
}) {
  return (
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
          cursor: currentPlayer.balance < price ? "not-allowed" : "pointer",
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
  );
}
