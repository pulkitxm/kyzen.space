"use client";

import type React from "react";
import type { Action, GameState, Player, PropertyTile, Tile } from "../types";
import { positionToCell } from "./useGamePhase";

export const GROUP_COLORS: Record<string, string> = {
  Brown: "#92400e",
  LightBlue: "#38bdf8",
  Pink: "#ec4899",
  Orange: "#f97316",
  Red: "#ef4444",
  Yellow: "#eab308",
  Green: "#22c55e",
  DarkBlue: "#3b82f6",
  Railroad: "#64748b",
  Utility: "#a78bfa",
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
@keyframes monoGlow {
  0%,100% { text-shadow: 0 0 20px rgba(96,165,250,0.3); }
  50%     { text-shadow: 0 0 40px rgba(96,165,250,0.8), 0 0 60px rgba(139,92,246,0.4); }
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

function tileOwner(state: GameState, tileId: string): Player | undefined {
  return state.players.find((p) =>
    p.ownedProperties.some((op) => op.tileId === tileId),
  );
}

function tileHouses(state: GameState, tileId: string): number {
  for (const p of state.players) {
    const op = p.ownedProperties.find((o) => o.tileId === tileId);
    if (op) return op.houses;
  }
  return 0;
}

interface TileCellProps {
  tile: Tile;
  state: GameState;
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
    animation = "destGlow 0.8s ease-in-out infinite";
    extraStyle = {
      background: "color-mix(in srgb, var(--warning) 15%, var(--card))",
    };
  } else if (canBuy) {
    animation = "tileGlowGreen 1.5s ease-in-out infinite";
  }

  const cornerIcon =
    tile.type === "Go"
      ? "🚦"
      : tile.type === "Jail"
        ? "⚖️"
        : tile.type === "FreeParking"
          ? "🅿️"
          : tile.type === "GoToJail"
            ? "👮"
            : null;

  const scaledPadding = Math.max(2, Math.floor(cellSize * 0.04));
  const scaledFontSize = Math.max(6, Math.floor(cellSize * 0.11));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tile cell is informational
    // biome-ignore lint/a11y/useKeyWithClickEvents: tile cell is informational and key-navigated via main controls
    <div
      onClick={onClick}
      title={tile.name}
      style={{
        width: "100%",
        height: "100%",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: scaledPadding,
        boxSizing: "border-box",
        fontSize: scaledFontSize,
        color: "var(--muted-foreground)",
        overflow: "hidden",
        position: "relative",
        cursor: isBuyable ? "pointer" : "default",
        transition: "background 0.15s",
        animation,
        ...extraStyle,
      }}
    >
      {}
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

      {}
      {cornerIcon && (
        <div
          style={{
            fontSize: Math.max(12, Math.floor(cellSize * 0.23)),
            lineHeight: 1,
            margin: "auto",
          }}
        >
          {cornerIcon}
        </div>
      )}

      {}
      {!cornerIcon && (
        <div
          style={{
            textAlign: "center",
            lineHeight: 1.15,
            fontWeight: 600,
            fontSize: Math.max(5.5, Math.floor(cellSize * 0.1)),
            padding: "0 1px",
            color: "var(--foreground)",
            flex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {tile.name}
        </div>
      )}

      {"price" in tile && (
        <div
          style={{
            fontSize: Math.max(5, Math.floor(cellSize * 0.09)),
            color: "var(--muted-foreground)",
            marginBottom: 1,
          }}
        >
          ${(tile as PropertyTile).price}
        </div>
      )}

      {}
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

      {}
      {owner && (
        <div
          style={{
            position: "absolute",
            bottom: Math.max(1, Math.floor(cellSize * 0.03)),
            right: Math.max(1, Math.floor(cellSize * 0.03)),
            fontSize: Math.max(6.5, Math.floor(cellSize * 0.12)),
            lineHeight: 1,
          }}
        >
          {owner.token}
        </div>
      )}
    </div>
  );
}

function buildGrid(board: Tile[]): (Tile | null)[][] {
  const COLS = 9;
  const ROWS = 9;
  const grid: (Tile | null)[][] = Array.from({ length: ROWS }, () =>
    Array(COLS).fill(null),
  );

  const byPos = Object.fromEntries(board.map((t) => [t.position, t]));

  for (let col = 0; col <= 8; col++) {
    grid[8][col] = byPos[8 - col] ?? null;
  }
  for (let col = 0; col <= 8; col++) {
    grid[0][col] = byPos[16 + col] ?? null;
  }
  for (let row = 1; row <= 7; row++) {
    grid[row][0] = byPos[16 - row] ?? null;
  }
  for (let row = 1; row <= 7; row++) {
    grid[row][8] = byPos[24 + row] ?? null;
  }

  return grid;
}

interface TokensOverlayProps {
  state: GameState;
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

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {state.players
        .filter((p) => !p.isBankrupt)
        .map((player, idx) => {
          const pos = animatedPositions[player.id] ?? player.position;
          const [row, col] = positionToCell(pos);

          const sameCell = state.players.filter(
            (p) =>
              !p.isBankrupt && (animatedPositions[p.id] ?? p.position) === pos,
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
          const [ox, oy] = offsets[myIdx] ?? [0, 0];

          const x = (col + 0.5) * cellSize + ox;
          const y = (row + 0.5) * cellSize + oy;

          const isCurrentPlayer =
            state.players[state.currentPlayerIndex]?.id === player.id;
          const isAnimating = isMoving && isCurrentPlayer;

          return (
            <div
              key={player.id}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
                fontSize: cellSize * 0.4,
                lineHeight: 1,
                transition: isAnimating
                  ? "left 0.12s ease-in-out, top 0.12s ease-in-out"
                  : "left 0.3s ease, top 0.3s ease",
                filter: isCurrentPlayer
                  ? "drop-shadow(0 0 5px rgba(96,165,250,0.9))"
                  : "drop-shadow(0 2px 3px rgba(0,0,0,0.4))",
                zIndex: isCurrentPlayer ? 5 : 4,
                animation: isAnimating
                  ? "tokenMove 0.12s ease-in-out"
                  : "tokenBob 2s ease-in-out infinite",
                animationDelay: `${idx * 0.3}s`,
              }}
            >
              {player.token}
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
  dispatch: (a: Action) => void;
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
      {}
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
            fontSize: Math.floor(cellSize * 1.1),
            fontWeight: 900,
            letterSpacing: -1,
            background:
              "linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textAlign: "center",
            lineHeight: 1,
            animation: "monoGlow 3s ease-in-out infinite",
            userSelect: "none",
          }}
        >
          MONO
          <br />
          POLY
        </div>
      </div>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stack is key-navigable via main controls */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: clickable card stack */}
      <div
        onClick={
          canDrawChance ? () => dispatch({ type: "DRAW_CARD" }) : undefined
        }
        style={{
          position: "absolute",
          right: cellSize * 0.3,
          top: cellSize * 0.3,
          width: cellSize * 1.4,
          height: cellSize * 1.0,
          pointerEvents: "all",
          cursor: canDrawChance ? "pointer" : "default",
          animation: "cardStackFloat 3s ease-in-out infinite",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        {}
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
                position: "absolute",
                inset: 0,
                transform: `translate(${i * 2}px, ${i * -2}px)`,
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--warning) 30%, var(--card)), color-mix(in srgb, var(--warning) 60%, var(--card)))",
                border: `1.5px solid ${canDrawChance ? "var(--warning)" : "color-mix(in srgb, var(--warning) 80%, black)"}`,
                borderRadius: 4,
                boxShadow: canDrawChance
                  ? `0 0 8px color-mix(in srgb, var(--warning) 50%, transparent)`
                  : "0 1px 3px rgba(0,0,0,0.2)",
                opacity: 1 - i * 0.15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
              position: "absolute",
              bottom: -14,
              fontSize: Math.floor(cellSize * 0.16),
              color: "var(--warning)",
              fontWeight: 700,
              whiteSpace: "nowrap",
              background: "var(--card)",
              borderRadius: 4,
              padding: "1px 4px",
              border: "1px solid var(--warning)",
              pointerEvents: "none",
            }}
          >
            Click to draw!
          </div>
        )}
      </div>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stack is key-navigable via main controls */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: clickable card stack */}
      <div
        onClick={canDrawCC ? () => dispatch({ type: "DRAW_CARD" }) : undefined}
        style={{
          position: "absolute",
          left: cellSize * 0.3,
          bottom: cellSize * 0.3,
          width: cellSize * 1.4,
          height: cellSize * 1.0,
          pointerEvents: "all",
          cursor: canDrawCC ? "pointer" : "default",
          animation: "cardStackFloat 3.5s ease-in-out infinite 0.5s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
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
                position: "absolute",
                inset: 0,
                transform: `translate(${-i * 2}px, ${i * 2}px)`,
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, var(--card)), color-mix(in srgb, var(--primary) 60%, var(--card)))",
                border: `1.5px solid ${canDrawCC ? "var(--primary)" : "color-mix(in srgb, var(--primary) 60%, var(--card))"}`,
                borderRadius: 4,
                boxShadow: canDrawCC
                  ? `0 0 8px color-mix(in srgb, var(--primary) 50%, transparent)`
                  : "0 1px 3px rgba(0,0,0,0.2)",
                opacity: 1 - i * 0.15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
              position: "absolute",
              bottom: -14,
              fontSize: Math.floor(cellSize * 0.16),
              color: "var(--primary)",
              fontWeight: 700,
              whiteSpace: "nowrap",
              background: "var(--card)",
              borderRadius: 4,
              padding: "1px 4px",
              border: "1px solid var(--primary)",
              pointerEvents: "none",
            }}
          >
            Click to draw!
          </div>
        )}
      </div>
    </div>
  );
}

interface BoardProps {
  state: GameState;
  animatedPositions: Record<string, number>;
  isMoving: boolean;
  landingPosition: number | null;
  destinationCell: number | null;
  mustDrawCard: boolean;
  onTileClick: (tile: Tile) => void;
  dispatch: (a: Action) => void;
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
    !state.players.some((p) =>
      p.ownedProperties.some(
        (op) => op.tileId === state.board[currentPlayer.position]?.id,
      ),
    )
      ? state.board[currentPlayer.position]?.id
      : null;

  const currentTileType = mustDrawCard
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
        width: "min(calc(100vw - 360px), calc(100vh - 100px))",
        maxWidth: "100%",
        aspectRatio: "1",
      }}
    >
      <div
        style={{
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
          boxShadow:
            "0 10px 30px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
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
