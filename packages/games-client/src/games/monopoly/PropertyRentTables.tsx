"use client";

import type {
  OwnedProperty,
  PropertyTile,
  RailroadTile,
  Tile,
} from "@kyzen/shared/types";
import type React from "react";

const RENT_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 6,
  transition: "background 0.2s, border-color 0.2s",
};

const TABLE_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted-foreground)",
  letterSpacing: 1,
  marginBottom: 4,
};

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

export function PropertyRentTables({
  tile,
  ownedProp,
}: {
  tile: Tile;
  ownedProp: OwnedProperty | undefined;
}) {
  if (tile.type === "Property") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={TABLE_LABEL_STYLE}>RENT TIERS</div>
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
    );
  }

  if (tile.type === "Railroad") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={TABLE_LABEL_STYLE}>RENT BY RAILROADS OWNED</div>
        {[1, 2, 3, 4].map((n) => (
          <RentRow
            key={n}
            label={`${n} Railroad${n > 1 ? "s" : ""}`}
            amount={(tile as RailroadTile).rent[n] ?? 0}
          />
        ))}
      </div>
    );
  }

  return null;
}
