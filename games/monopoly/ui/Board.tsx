'use client';

import React from 'react';
import type { GameState, Tile, Player } from '../types';

// ─── Tile color palette by group ─────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  Brown:    '#8B4513',
  LightBlue:'#ADD8E6',
  Pink:     '#FF69B4',
  Orange:   '#FF8C00',
  Red:      '#DC143C',
  Yellow:   '#FFD700',
  Green:    '#228B22',
  DarkBlue: '#00008B',
  Railroad: '#333333',
  Utility:  '#888888',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tileOwner(state: GameState, tileId: string): Player | undefined {
  return state.players.find((p) =>
    p.ownedProperties.some((op) => op.tileId === tileId)
  );
}

function tileHouses(state: GameState, tileId: string): number {
  for (const p of state.players) {
    const op = p.ownedProperties.find((o) => o.tileId === tileId);
    if (op) return op.houses;
  }
  return 0;
}

// ─── Single cell ─────────────────────────────────────────────────────────────

function TileCell({ tile, state }: { tile: Tile; state: GameState }) {
  const owner = tileOwner(state, tile.id);
  const houses = tileHouses(state, tile.id);
  const playersHere = state.players.filter(
    (p) => p.position === tile.position && !p.isBankrupt
  );
  const groupColor =
    (tile.type === 'Property' || tile.type === 'Railroad' || tile.type === 'Utility')
      ? GROUP_COLORS[(tile as { group?: string }).group ?? tile.type] ?? '#ccc'
      : undefined;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#1e2235',
        border: '1px solid #334',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 2,
        boxSizing: 'border-box',
        fontSize: 7,
        color: '#e0e4f0',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Color band */}
      {groupColor && (
        <div style={{ width: '100%', height: 6, background: groupColor, borderRadius: 2 }} />
      )}
      {/* Tile name */}
      <div style={{ textAlign: 'center', lineHeight: 1.1, fontWeight: 600, fontSize: 6, padding: '0 1px' }}>
        {tile.name}
      </div>
      {/* Houses */}
      {houses > 0 && (
        <div style={{ fontSize: 8, color: houses === 5 ? '#f97316' : '#4ade80' }}>
          {houses === 5 ? '🏨' : '🏠'.repeat(houses)}
        </div>
      )}
      {/* Owner dot */}
      {owner && (
        <div style={{ fontSize: 8 }}>{owner.token}</div>
      )}
      {/* Players on tile */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {playersHere.map((p) => (
          <span key={p.id} style={{ fontSize: 9 }}>{p.token}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Board layout ─────────────────────────────────────────────────────────────
// Classic Monopoly: 11×11 grid. Corners at 0,10,20,30. Edges fill in between.

function buildGrid(board: Tile[]): (Tile | null)[][] {
  const grid: (Tile | null)[][] = Array.from({ length: 11 }, () => Array(11).fill(null));
  // Bottom row (left→right): positions 0–10
  for (let i = 0; i <= 10; i++) grid[10][i] = board[i];
  // Left column (bottom→top): positions 10–20
  for (let i = 0; i <= 10; i++) grid[10 - i][0] = board[10 + i];
  // Top row (left→right): positions 20–30
  for (let i = 0; i <= 10; i++) grid[0][i] = board[20 + i];
  // Right column (top→bottom): positions 30–40 (0)
  for (let i = 0; i <= 10; i++) grid[i][10] = board[(30 + i) % 40];
  return grid;
}

// ─── Board component ─────────────────────────────────────────────────────────

export function Board({ state }: { state: GameState }) {
  const grid = buildGrid([...state.board]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(11, 1fr)',
        gridTemplateRows: 'repeat(11, 1fr)',
        width: '100%',
        maxWidth: 700,
        aspectRatio: '1',
        gap: 2,
        background: '#0f1220',
        borderRadius: 8,
        padding: 4,
      }}
    >
      {grid.flat().map((tile, idx) =>
        tile ? (
          <TileCell key={tile.id} tile={tile} state={state} />
        ) : (
          <div key={`empty-${idx}`} style={{ background: '#0f1220' }} />
        )
      )}
    </div>
  );
}
