'use client';

import React from 'react';
import type { GameState, Action, Player } from '../types';
import { TILE_BY_ID } from '../constants/board';
import type { PropertyTile } from '../types';

interface ControlsProps {
  state: GameState;
  dispatch: (action: Action) => void;
  onRoll: () => void; // rolls dice externally and dispatches ROLL_DICE
}

function PlayerCard({ player, isActive }: { player: Player; isActive: boolean }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: isActive ? '#1e3a5f' : '#1a1f35',
        border: `1px solid ${isActive ? '#3b82f6' : '#334'}`,
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: 20 }}>{player.token}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: isActive ? '#93c5fd' : '#9ca3af', fontSize: 13 }}>
          {player.name} {player.isBankrupt && '💀'}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          ${player.balance.toLocaleString()} · {player.inJail ? '🔒 Jail' : `Pos ${player.position}`}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#4b5563' }}>
        {player.ownedProperties.length} props
      </div>
    </div>
  );
}

export function Controls({ state, dispatch, onRoll }: ControlsProps) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const currentTile = state.board[currentPlayer.position];
  const canBuy =
    state.turnPhase === 'LANDED' &&
    (currentTile.type === 'Property' || currentTile.type === 'Railroad' || currentTile.type === 'Utility') &&
    !state.players.some((p) => p.ownedProperties.some((op) => op.tileId === currentTile.id));
  const mustDrawCard =
    state.turnPhase === 'LANDED' &&
    (currentTile.type === 'Chance' || currentTile.type === 'CommunityChest');

  const ownedProperties = currentPlayer.ownedProperties.map((op) => ({
    op,
    tile: TILE_BY_ID[op.tileId],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* Current turn info */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: '#111827',
          border: '1px solid #1f2937',
        }}
      >
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>CURRENT TURN</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e5e7eb' }}>
          {currentPlayer.token} {currentPlayer.name}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
          Phase: <span style={{ color: '#60a5fa' }}>{state.turnPhase}</span>
          {' · '}Dice: {state.dice[0]} + {state.dice[1]} = {state.dice[0] + state.dice[1]}
          {state.doublesCount > 0 && ` · 🎯 Doubles ×${state.doublesCount}`}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {/* Roll */}
        {state.turnPhase === 'WAITING_FOR_ROLL' && state.winnerId === null && (
          <ActionButton
            label={currentPlayer.inJail ? '🎲 Roll (Escape Jail)' : '🎲 Roll Dice'}
            color="#3b82f6"
            onClick={onRoll}
          />
        )}

        {/* Jail actions */}
        {currentPlayer.inJail && state.turnPhase === 'WAITING_FOR_ROLL' && (
          <>
            <ActionButton
              label={`💰 Pay $50 Fine`}
              color="#f59e0b"
              onClick={() => dispatch({ type: 'PAY_JAIL_FINE' })}
              disabled={currentPlayer.balance < 50}
            />
            {currentPlayer.outOfJailCards > 0 && (
              <ActionButton
                label="🃏 Use Card"
                color="#10b981"
                onClick={() => dispatch({ type: 'USE_OUT_OF_JAIL_CARD' })}
              />
            )}
          </>
        )}

        {/* Buy / Decline */}
        {canBuy && (
          <>
            <ActionButton
              label={`🏠 Buy ${currentTile.name}`}
              color="#10b981"
              onClick={() => dispatch({ type: 'BUY_PROPERTY' })}
              disabled={currentPlayer.balance < ((currentTile as PropertyTile).price ?? 0)}
            />
            <ActionButton
              label="✗ Decline"
              color="#6b7280"
              onClick={() => dispatch({ type: 'DECLINE_PURCHASE' })}
            />
          </>
        )}

        {/* Draw card (Chance / Community Chest) */}
        {mustDrawCard && (
          <ActionButton
            label={`🃏 Draw ${currentTile.type === 'Chance' ? 'Chance' : 'Community Chest'} Card`}
            color="#f59e0b"
            onClick={() => dispatch({ type: 'DRAW_CARD' })}
          />
        )}

        {/* End turn */}
        {state.turnPhase === 'WAITING_FOR_END_TURN' && (
          <ActionButton
            label="➡ End Turn"
            color="#8b5cf6"
            onClick={() => dispatch({ type: 'END_TURN' })}
          />
        )}

        {/* Bankruptcy */}
        {state.turnPhase !== 'GAME_OVER' && currentPlayer.balance < 0 && (
          <ActionButton
            label="💀 Declare Bankruptcy"
            color="#ef4444"
            onClick={() => dispatch({ type: 'DECLARE_BANKRUPTCY' })}
          />
        )}
      </div>

      {/* Owned properties list */}
      {ownedProperties.length > 0 && (
        <div style={{ background: '#111827', borderRadius: 8, padding: '10px 12px', border: '1px solid #1f2937' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>YOUR PROPERTIES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ownedProperties.map(({ op, tile }) => (
              <div
                key={op.tileId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: op.isMortgaged ? '#6b7280' : '#d1d5db',
                }}
              >
                <span style={{ flex: 1 }}>{op.isMortgaged ? '〰' : ''} {tile.name}</span>
                <span style={{ color: '#4ade80', fontSize: 10 }}>
                  {op.houses === 5 ? '🏨' : op.houses > 0 ? `🏠×${op.houses}` : ''}
                </span>
                {tile.type === 'Property' && !op.isMortgaged && (
                  <>
                    <SmallButton
                      label="+"
                      onClick={() => dispatch({ type: 'BUILD_HOUSE', payload: { tileId: op.tileId } })}
                    />
                    {op.houses > 0 && (
                      <SmallButton
                        label="-"
                        onClick={() => dispatch({ type: 'SELL_HOUSE', payload: { tileId: op.tileId } })}
                      />
                    )}
                  </>
                )}
                <SmallButton
                  label={op.isMortgaged ? '↑' : '↓'}
                  onClick={() =>
                    dispatch(
                      op.isMortgaged
                        ? { type: 'UNMORTGAGE_PROPERTY', payload: { tileId: op.tileId } }
                        : { type: 'MORTGAGE_PROPERTY', payload: { tileId: op.tileId } }
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All players */}
      <div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>PLAYERS</div>
        {state.players.map((p) => (
          <PlayerCard key={p.id} player={p} isActive={p.id === currentPlayer.id} />
        ))}
      </div>
    </div>
  );
}

// ─── Mini components ──────────────────────────────────────────────────────────

function ActionButton({
  label, color, onClick, disabled = false,
}: {
  label: string; color: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: 'none',
        background: disabled ? '#374151' : color,
        color: disabled ? '#6b7280' : '#fff',
        fontWeight: 600,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function SmallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '1px 5px',
        fontSize: 10,
        borderRadius: 4,
        border: '1px solid #374151',
        background: '#1f2937',
        color: '#9ca3af',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
