"use client";

import type { OwnedProperty, Player } from "@kyzen/shared/types";

export function PropertyOwnership({
  isOwned,
  owner,
  isCurrentPlayerOwner,
  ownedProp,
}: {
  isOwned: boolean;
  owner: Player | undefined;
  isCurrentPlayerOwner: boolean;
  ownedProp: OwnedProperty | undefined;
}) {
  return (
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
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
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
  );
}
