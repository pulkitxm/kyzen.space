"use client";

import { avataaars } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { seedAvatarConfig, toDicebearOptions } from "@kyzen/avatar";
import type {
  AvatarConfig,
  MonopolyMove,
  MonopolyState,
  Player,
  PropertyTile,
  Tile,
} from "@kyzen/shared/types";
import type React from "react";
import { GROUP_COLORS } from "./board-constants";
import { positionToCell } from "./useGamePhase";

export function PlayerAvatar({
  avatar,
  username,
  size,
  className,
}: {
  avatar?: AvatarConfig | null;
  username: string;
  size: number;
  className?: string;
}) {
  const resolved = avatar ?? seedAvatarConfig(username || "player");
  const dataUri = createAvatar(
    avataaars,
    toDicebearOptions(resolved) as unknown as Parameters<
      typeof createAvatar
    >[1],
  ).toDataUri();

  return (
    <div
      className={className}
      style={{ ...AVATAR_FRAME_STYLE, width: size, height: size }}
    >
      <img
        src={dataUri}
        alt={`${username}'s avatar`}
        style={{
          ...AVATAR_IMAGE_STYLE,
          width: size,
          height: size,
        }}
      />
    </div>
  );
}

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

const AVATAR_FRAME_STYLE: React.CSSProperties = {
  borderRadius: "50%",
  overflow: "hidden",
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
};

const AVATAR_IMAGE_STYLE: React.CSSProperties = {
  display: "block",
  objectFit: "cover",
  objectPosition: "center",
};

const CORNER_IMAGE_STYLE: React.CSSProperties = {
  objectFit: "contain",
  objectPosition: "center",
};

const TILE_CELL_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 2,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "space-between",
  boxSizing: "border-box",
  color: "var(--muted-foreground)",
  overflow: "hidden",
  position: "relative",
  transition: "background 0.15s",
};

const TILE_NAME_STYLE: React.CSSProperties = {
  textAlign: "center",
  lineHeight: 1.15,
  fontWeight: 600,
  padding: "0 1px",
  color: "var(--foreground)",
  flex: 1,
  display: "flex",
  alignItems: "center",
};

const CARD_STACK_STYLE: React.CSSProperties = {
  position: "absolute",
  pointerEvents: "all",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
};

const TOKEN_STYLE: React.CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
};

const CARD_LAYER_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const TITLE_STYLE: React.CSSProperties = {
  fontWeight: 900,
  letterSpacing: -1,
  background:
    "linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  textAlign: "center",
  lineHeight: 1,
  userSelect: "none",
};

const CARD_HINT_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: -14,
  fontWeight: 700,
  whiteSpace: "nowrap",
  background: "var(--card)",
  borderRadius: 4,
  padding: "1px 4px",
  pointerEvents: "none",
};

const BOARD_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(9, 1fr)",
  gridTemplateRows: "repeat(9, 1fr)",
  width: "100%",
  aspectRatio: "1",
  gap: 2,
  background: "var(--border)",
  borderRadius: 10,
  padding: 4,
  border: "2px solid var(--border)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)",
};

const BOARD_STYLE = `
@keyframes tilePulse {
  0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(96,165,250,0); }
  40%  { transform: scale(1.06); box-shadow: 0 0 10px 3px rgba(96,165,250,0.5); }
  100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(96,165,250,0); }
}
@keyframes tokenBob {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50%       { transform: translate(-50%, -50%) translateY(-5px); }
}
@keyframes tokenMove {
  0%   { transform: translate(-50%, -50%) scale(1); }
  50%  { transform: translate(-50%, -50%) scale(1.3) translateY(-5px); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
@keyframes tileGlowGreen {
  0%,100% { box-shadow: 0 0 6px rgba(74,222,128,0.5); }
  50%     { box-shadow: 0 0 18px rgba(74,222,128,1); }
}
@keyframes destGlow {
  0%,100% { box-shadow: inset 0 0 0 2px rgba(251,191,36,0.6); }
  50%     { box-shadow: inset 0 0 0 3px rgba(251,191,36,1), 0 0 12px rgba(251,191,36,0.5); }
}
@keyframes cardStackFloat {
  0%,100% { transform: translateY(0) rotate(-2deg); }
  50%     { transform: translateY(-4px) rotate(2deg); }
}
`;

let styleInjected = false;
function injectBoardStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = BOARD_STYLE;
  document.head.appendChild(el);
}

function tileOwner(state: MonopolyState, tileId: string): Player | undefined {
  return state.players.find((p) =>
    p.ownedProperties.some((op) => op.tileId === tileId),
  );
}

function tileHouses(state: MonopolyState, tileId: string): number {
  const housesByTile = new Map<string, number>();
  for (const p of state.players) {
    for (const op of p.ownedProperties) {
      if (!housesByTile.has(op.tileId)) {
        housesByTile.set(op.tileId, op.houses);
      }
    }
  }
  return housesByTile.get(tileId) ?? 0;
}

interface TileCellProps {
  tile: Tile;
  state: MonopolyState;
  isLanding: boolean;
  isDestination: boolean;
  canBuy: boolean;
  onClick: () => void;
  cellSize: number;
}

function TileCell({
  tile,
  state,
  isLanding,
  isDestination,
  canBuy,
  onClick,
  cellSize,
}: TileCellProps) {
  const owner = tileOwner(state, tile.id);
  const houses = tileHouses(state, tile.id);
  const groupColor =
    tile.type === "Property"
      ? GROUP_COLORS[(tile as PropertyTile).group]
      : tile.type === "Railroad"
        ? GROUP_COLORS.Railroad
        : tile.type === "Utility"
          ? GROUP_COLORS.Utility
          : undefined;

  const isBuyable =
    tile.type === "Property" ||
    tile.type === "Railroad" ||
    tile.type === "Utility";

  let animation = "none";
  let extraStyle: React.CSSProperties = {};
  if (isLanding) {
    animation = "tilePulse 0.5s ease-out";
  } else if (isDestination) {
    animation = "destGlow 0.3s ease-in-out infinite";
    extraStyle = {
      background: "color-mix(in srgb, var(--warning) 15%, var(--card))",
    };
  } else if (canBuy) {
    animation = "tileGlowGreen 1.5s ease-in-out infinite";
  }

  const cornerIcon =
    tile.type === "Go" ? (
      "🚦"
    ) : tile.type === "Jail" ? (
      <img
        src="/games/monopoly/jail.png"
        alt="Jail"
        style={{
          ...CORNER_IMAGE_STYLE,
          width: Math.max(28, Math.floor(cellSize * 0.65)),
          height: Math.max(28, Math.floor(cellSize * 0.65)),
        }}
      />
    ) : tile.type === "FreeParking" ? (
      "🅿️"
    ) : tile.type === "GoToJail" ? (
      <img
        src="/games/monopoly/go-to-jail.png"
        alt="Go to Jail"
        style={{
          ...CORNER_IMAGE_STYLE,
          width: Math.max(28, Math.floor(cellSize * 0.65)),
          height: Math.max(28, Math.floor(cellSize * 0.65)),
        }}
      />
    ) : null;

  const scaledPadding = Math.max(2, Math.floor(cellSize * 0.04));
  const scaledFontSize = Math.max(7, Math.floor(cellSize * 0.13));

  return (
    <button
      type="button"
      onClick={onClick}
      title={tile.name}
      style={{
        ...BUTTON_RESET,
        ...TILE_CELL_STYLE,
        padding: scaledPadding,
        fontSize: scaledFontSize,
        cursor: isBuyable ? "pointer" : "default",
        animation,
        ...extraStyle,
      }}
    >
      {groupColor && (
        <div
          style={{
            width: "100%",
            height: Math.max(5, Math.floor(cellSize * 0.12)),
            background: groupColor,
            borderRadius: "1px 1px 0 0",
            flexShrink: 0,
          }}
        />
      )}

      {cornerIcon && (
        <div
          style={{
            fontSize:
              typeof cornerIcon === "string"
                ? Math.max(12, Math.floor(cellSize * 0.23))
                : undefined,
            lineHeight: 1,
            margin: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {cornerIcon}
        </div>
      )}

      {!cornerIcon && (
        <div
          style={{
            ...TILE_NAME_STYLE,
            fontSize: Math.max(6.5, Math.floor(cellSize * 0.12)),
          }}
        >
          {tile.name}
        </div>
      )}

      {"price" in tile && (
        <div
          style={{
            fontSize: Math.max(6, Math.floor(cellSize * 0.11)),
            color: "var(--muted-foreground)",
            marginBottom: 1,
          }}
        >
          ${(tile as PropertyTile).price}
        </div>
      )}

      {houses > 0 && (
        <div
          style={{
            fontSize: Math.max(6.5, Math.floor(cellSize * 0.12)),
            color: houses === 5 ? "#f97316" : "#16a34a",
            lineHeight: 1,
          }}
        >
          {houses === 5 ? "🏨" : "🏠".repeat(houses)}
        </div>
      )}

      {owner && (
        <div
          style={{
            position: "absolute",
            bottom: Math.max(1, Math.floor(cellSize * 0.03)),
            right: Math.max(1, Math.floor(cellSize * 0.03)),
            lineHeight: 1,
          }}
        >
          <PlayerAvatar username={owner.name} size={cellSize * 0.22} />
        </div>
      )}
    </button>
  );
}

function buildGrid(board: Tile[]): (Tile | null)[][] {
  const COLS = 9;
  const ROWS = 9;
  const grid: (Tile | null)[][] = Array.from({ length: ROWS }, () =>
    Array(COLS).fill(null),
  );

  const byPos = new Map<number, Tile>();
  for (const t of board) {
    byPos.set(t.position, t);
  }

  const row8 = grid[8];
  const row0 = grid[0];
  if (row8 && row0) {
    for (let col = 0; col <= 8; col++) {
      row8[col] = byPos.get(8 - col) ?? null;
      row0[col] = byPos.get(16 + col) ?? null;
    }
  }
  for (let row = 1; row <= 7; row++) {
    const r = grid[row];
    if (r) {
      r[0] = byPos.get(16 - row) ?? null;
      r[8] = byPos.get(24 + row) ?? null;
    }
  }

  return grid;
}

interface TokensOverlayProps {
  state: MonopolyState;
  animatedPositions: Record<string, number>;
  isMoving: boolean;
  boardSize: number;
}

function TokensOverlay({
  state,
  animatedPositions,
  isMoving,
  boardSize,
}: TokensOverlayProps) {
  const cellSize = boardSize / 9;
  const activePlayers = state.players.filter((p) => !p.isBankrupt);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {activePlayers.map((player, idx) => {
        const pos = animatedPositions[player.id] ?? player.position;
        const [row, col] = positionToCell(pos);

        const sameCell = activePlayers.filter(
          (p) => (animatedPositions[p.id] ?? p.position) === pos,
        );
        const myIdx = sameCell.findIndex((p) => p.id === player.id);
        const offsets = [
          [0, 0],
          [6, -6],
          [-6, 6],
          [6, 6],
          [-6, -6],
          [10, 0],
          [-10, 0],
          [0, 10],
          [0, -10],
        ];
        const [ox, oy] = (offsets[myIdx] ?? [0, 0]) as [number, number];

        const x = (col + 0.5) * cellSize + ox;
        const y = (row + 0.5) * cellSize + oy;

        const isCurrentPlayer =
          state.players[state.currentPlayerIndex]?.id === player.id;
        const isAnimating = isMoving && isCurrentPlayer;

        return (
          <div
            key={player.id}
            style={{
              ...TOKEN_STYLE,
              left: x,
              top: y,
              transition: isAnimating
                ? "left 0.12s ease-in-out, top 0.12s ease-in-out"
                : "none",
              zIndex: isCurrentPlayer ? 5 : 4,
              animation: isAnimating
                ? "tokenMove 0.12s ease-in-out"
                : "tokenBob 0.3s ease-in-out infinite",
              animationDelay: `${idx * 0.3}s`,
            }}
          >
            <PlayerAvatar
              username={player.name}
              size={cellSize * 0.45}
              className={
                isCurrentPlayer
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-card"
                  : ""
              }
            />
          </div>
        );
      })}
    </div>
  );
}

interface CenterOverlayProps {
  boardSize: number;
  mustDrawCard: boolean;
  currentTileType: string | null;
  dispatch: (a: MonopolyMove) => void;
}

function CenterOverlay({
  boardSize,
  mustDrawCard,
  currentTileType,
  dispatch,
}: CenterOverlayProps) {
  const cellSize = boardSize / 9;
  const left = cellSize;
  const top = cellSize;
  const size = cellSize * 7;

  const canDrawChance = mustDrawCard && currentTileType === "Chance";
  const canDrawCC = mustDrawCard && currentTileType === "CommunityChest";

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        pointerEvents: "none",
        zIndex: 8,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <div
          style={{
            ...TITLE_STYLE,
            fontSize: Math.floor(cellSize * 1.1),
          }}
        >
          MONO
          <br />
          POLY
        </div>
      </div>

      <button
        type="button"
        onClick={
          canDrawChance ? () => dispatch({ type: "DRAW_CARD" }) : undefined
        }
        style={{
          ...BUTTON_RESET,
          ...CARD_STACK_STYLE,
          right: cellSize * 0.3,
          top: cellSize * 0.3,
          width: cellSize * 1.4,
          height: cellSize * 1.0,
          cursor: canDrawChance ? "pointer" : "default",
          animation: "cardStackFloat 0.3s ease-in-out infinite",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {[2, 1, 0].map((i) => (
            <div
              key={i}
              style={{
                ...CARD_LAYER_STYLE,
                transform: `translate(${i * 2}px, ${i * -2}px)`,
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--warning) 30%, var(--card)), color-mix(in srgb, var(--warning) 60%, var(--card)))",
                border: `1.5px solid ${canDrawChance ? "var(--warning)" : "color-mix(in srgb, var(--warning) 80%, black)"}`,
                boxShadow: canDrawChance
                  ? `0 0 8px color-mix(in srgb, var(--warning) 50%, transparent)`
                  : "0 1px 3px rgba(0,0,0,0.2)",
                opacity: 1 - i * 0.15,
              }}
            >
              {i === 0 && (
                <span
                  style={{
                    fontSize: Math.floor(cellSize * 0.28),
                    textAlign: "center",
                    lineHeight: 1.2,
                    fontWeight: 800,
                    color: canDrawChance
                      ? "var(--warning-foreground)"
                      : "color-mix(in srgb, var(--warning) 80%, black)",
                    padding: "0 4px",
                  }}
                >
                  ?<br />
                  <span
                    style={{
                      fontSize: Math.floor(cellSize * 0.14),
                      fontWeight: 600,
                      display: "block",
                    }}
                  >
                    CHANCE
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
        {canDrawChance && (
          <div
            style={{
              ...CARD_HINT_STYLE,
              fontSize: Math.floor(cellSize * 0.16),
              color: "var(--warning)",
              border: "1px solid var(--warning)",
            }}
          >
            Click to draw!
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={canDrawCC ? () => dispatch({ type: "DRAW_CARD" }) : undefined}
        style={{
          ...BUTTON_RESET,
          ...CARD_STACK_STYLE,
          left: cellSize * 0.3,
          bottom: cellSize * 0.3,
          width: cellSize * 1.4,
          height: cellSize * 1.0,
          cursor: canDrawCC ? "pointer" : "default",
          animation: "cardStackFloat 0.3s ease-in-out infinite 0.5s",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {[2, 1, 0].map((i) => (
            <div
              key={i}
              style={{
                ...CARD_LAYER_STYLE,
                transform: `translate(${-i * 2}px, ${i * 2}px)`,
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, var(--card)), color-mix(in srgb, var(--primary) 60%, var(--card)))",
                border: `1.5px solid ${canDrawCC ? "var(--primary)" : "color-mix(in srgb, var(--primary) 60%, var(--card))"}`,
                boxShadow: canDrawCC
                  ? `0 0 8px color-mix(in srgb, var(--primary) 50%, transparent)`
                  : "0 1px 3px rgba(0,0,0,0.2)",
                opacity: 1 - i * 0.15,
              }}
            >
              {i === 0 && (
                <span
                  style={{
                    fontSize: Math.floor(cellSize * 0.24),
                    textAlign: "center",
                    lineHeight: 1.1,
                    fontWeight: 800,
                    color: canDrawCC
                      ? "var(--primary-foreground)"
                      : "var(--primary)",
                    padding: "0 3px",
                  }}
                >
                  🏛<br />
                  <span
                    style={{
                      fontSize: Math.floor(cellSize * 0.11),
                      fontWeight: 600,
                      display: "block",
                    }}
                  >
                    COMMUNITY
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
        {canDrawCC && (
          <div
            style={{
              ...CARD_HINT_STYLE,
              fontSize: Math.floor(cellSize * 0.16),
              color: "var(--primary)",
              border: "1px solid var(--primary)",
            }}
          >
            Click to draw!
          </div>
        )}
      </button>
    </div>
  );
}

interface BoardProps {
  state: MonopolyState;
  animatedPositions: Record<string, number>;
  isMoving: boolean;
  landingPosition: number | null;
  destinationCell: number | null;
  mustDrawCard: boolean;
  onTileClick: (tile: Tile) => void;
  dispatch: (a: MonopolyMove) => void;
  boardRef: React.RefObject<HTMLDivElement | null>;
  boardSize: number;
}

export function Board({
  state,
  animatedPositions,
  isMoving,
  landingPosition,
  destinationCell,
  mustDrawCard,
  onTileClick,
  dispatch,
  boardRef,
  boardSize,
}: BoardProps) {
  injectBoardStyle();

  const grid = buildGrid([...state.board]);
  const currentPlayer = state.players[state.currentPlayerIndex];

  const canBuyTileId =
    state.turnPhase === "LANDED" &&
    currentPlayer &&
    !state.players.some((p) =>
      p.ownedProperties.some(
        (op) => op.tileId === state.board[currentPlayer.position]?.id,
      ),
    )
      ? state.board[currentPlayer.position]?.id
      : null;

  const currentTileType =
    mustDrawCard && currentPlayer
      ? (state.board[currentPlayer.position]?.type ?? null)
      : null;

  const cellSize = boardSize / 9;
  const flatGrid = grid.flatMap((row, rIdx) =>
    row.map((tile, cIdx) => ({
      tile,
      key: tile ? tile.id : `empty-${rIdx}-${cIdx}`,
    })),
  );

  return (
    <div
      ref={boardRef}
      style={{
        position: "relative",
        width: "min(100%, calc(100vh - 160px))",
        maxWidth: "100%",
        aspectRatio: "1",
      }}
    >
      <div style={BOARD_GRID_STYLE}>
        {flatGrid.map(({ tile, key }) =>
          tile ? (
            <TileCell
              key={key}
              tile={tile}
              state={state}
              isLanding={landingPosition === tile.position}
              isDestination={destinationCell === tile.position}
              canBuy={tile.id === canBuyTileId}
              onClick={() => onTileClick(tile)}
              cellSize={cellSize}
            />
          ) : (
            <div
              key={key}
              style={{
                background: "transparent",
              }}
            />
          ),
        )}
      </div>

      <CenterOverlay
        boardSize={boardSize}
        mustDrawCard={mustDrawCard}
        currentTileType={currentTileType}
        dispatch={dispatch}
      />

      <TokensOverlay
        state={state}
        animatedPositions={animatedPositions}
        isMoving={isMoving}
        boardSize={boardSize}
      />
    </div>
  );
}
