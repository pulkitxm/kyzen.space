"use client";

import type { PropertyTile, Tile } from "@kyzen/shared/types";

export function PropertyPanelHeader({
  tile,
  onClose,
}: {
  tile: Tile;
  onClose: () => void;
}) {
  return (
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
  );
}
