'use client';

import React from 'react';
import type { GameState, Action, Tile, PropertyTile, RailroadTile, UtilityTile, Player } from '../types';
import { GROUP_COLORS } from './Board';

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL_STYLE = `
@keyframes panelSlideIn {
  from { opacity: 0; transform: translateX(32px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes cardFlipIn {
  from { opacity: 0; transform: rotateY(90deg) scale(0.92); }
  to   { opacity: 1; transform: rotateY(0deg) scale(1); }
}
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = PANEL_STYLE;
  document.head.appendChild(el);
}

// ─── Rent tier row ────────────────────────────────────────────────────────────

function RentRow({ label, amount, highlight }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 10px',
      borderRadius: 6,
      background: highlight ? 'rgba(96,165,250,0.15)' : 'transparent',
      border: highlight ? '1px solid rgba(96,165,250,0.4)' : '1px solid transparent',
      transition: 'all 0.2s',
    }}>
      <span style={{ fontSize: 12, color: highlight ? '#93c5fd' : '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: highlight ? '#60a5fa' : '#9ca3af' }}>${amount}</span>
    </div>
  );
}

// ─── Property panel ───────────────────────────────────────────────────────────

interface PropertyPanelProps {
  tile: Tile;
  state: GameState;
  dispatch: (a: Action) => void;
  onClose: () => void;
}

function ownerOf(state: GameState, tileId: string): Player | undefined {
  return state.players.find((p) => p.ownedProperties.some((op) => op.tileId === tileId));
}

export function PropertyPanel({ tile, state, dispatch, onClose }: PropertyPanelProps) {
  injectStyle();

  const currentPlayer = state.players[state.currentPlayerIndex];
  const owner = ownerOf(state, tile.id);
  const isOwned = !!owner;
  const isCurrentPlayerOwner = owner?.id === currentPlayer.id;
  const ownedProp = owner?.ownedProperties.find((op) => op.tileId === tile.id);

  const canBuy =
    state.turnPhase === 'LANDED' &&
    currentPlayer.position === tile.position &&
    !isOwned &&
    (tile.type === 'Property' || tile.type === 'Railroad' || tile.type === 'Utility');

  const price = (tile as PropertyTile | RailroadTile | UtilityTile).price ?? 0;
  const groupColor = tile.type === 'Property'
    ? GROUP_COLORS[(tile as PropertyTile).group] ?? '#888'
    : tile.type === 'Railroad' ? GROUP_COLORS.Railroad
    : tile.type === 'Utility' ? GROUP_COLORS.Utility
    : '#888';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 200,
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', right: 16, top: '50%',
        transform: 'translateY(-50%)',
        width: 300,
        background: 'linear-gradient(160deg, #1a1f35 0%, #0f1220 100%)',
        border: '1px solid #2a3050',
        borderRadius: 16,
        zIndex: 201,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        animation: 'panelSlideIn 0.25s ease-out',
        overflow: 'hidden',
      }}>
        {/* Color header */}
        <div style={{
          height: 8,
          background: groupColor,
        }} />

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>
                {tile.name}
              </div>
              <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
                {tile.type === 'Property' ? `${(tile as PropertyTile).group} Group` : tile.type}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer',
              fontSize: 18, padding: 0, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Price */}
          {price > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: '1px solid #1f2937',
            }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Purchase Price</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24' }}>${price}</span>
            </div>
          )}

          {/* Owner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            border: '1px solid #1f2937',
          }}>
            {isOwned ? (
              <>
                <span style={{ fontSize: 18 }}>{owner!.token}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Owned by</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isCurrentPlayerOwner ? '#4ade80' : '#f87171' }}>
                    {owner!.name} {isCurrentPlayerOwner && '(You)'}
                  </div>
                </div>
                {ownedProp?.isMortgaged && (
                  <span style={{ fontSize: 10, color: '#ef4444', background: '#450a0a', padding: '2px 6px', borderRadius: 4 }}>
                    MORTGAGED
                  </span>
                )}
                {ownedProp && ownedProp.houses > 0 && (
                  <span style={{ fontSize: 13 }}>
                    {ownedProp.houses === 5 ? '🏨' : `🏠×${ownedProp.houses}`}
                  </span>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280' }}>🏦 Bank — Available</div>
            )}
          </div>

          {/* Rent tiers (Property only) */}
          {tile.type === 'Property' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 1, marginBottom: 4 }}>RENT TIERS</div>
              <RentRow label="Base Rent"  amount={(tile as PropertyTile).rent[0]} highlight={!ownedProp || ownedProp.houses === 0} />
              <RentRow label="1 House"    amount={(tile as PropertyTile).rent[1]} highlight={ownedProp?.houses === 1} />
              <RentRow label="2 Houses"   amount={(tile as PropertyTile).rent[2]} highlight={ownedProp?.houses === 2} />
              <RentRow label="3 Houses"   amount={(tile as PropertyTile).rent[3]} highlight={ownedProp?.houses === 3} />
              <RentRow label="4 Houses"   amount={(tile as PropertyTile).rent[4]} highlight={ownedProp?.houses === 4} />
              <RentRow label="Hotel 🏨"   amount={(tile as PropertyTile).rent[5]} highlight={ownedProp?.houses === 5} />
            </div>
          )}

          {/* Railroad rents */}
          {tile.type === 'Railroad' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 1, marginBottom: 4 }}>RENT BY RAILROADS OWNED</div>
              {[1,2,3,4].map((n) => (
                <RentRow key={n} label={`${n} Railroad${n > 1 ? 's' : ''}`} amount={(tile as RailroadTile).rent[n]} />
              ))}
            </div>
          )}

          {/* Buy CTA */}
          {canBuy && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { dispatch({ type: 'BUY_PROPERTY' }); onClose(); }}
                disabled={currentPlayer.balance < price}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: currentPlayer.balance < price
                    ? '#1f2937'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                  color: currentPlayer.balance < price ? '#4b5563' : '#fff',
                  fontWeight: 700, fontSize: 13,
                  cursor: currentPlayer.balance < price ? 'not-allowed' : 'pointer',
                }}
              >
                Buy ${price}
              </button>
              <button
                onClick={() => { dispatch({ type: 'DECLINE_PURCHASE' }); onClose(); }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: '1px solid #374151',
                  background: 'transparent',
                  color: '#6b7280',
                  fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Skip
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Card modal ───────────────────────────────────────────────────────────────

const CARD_STYLE = `
@keyframes cardSlideUp {
  from { opacity: 0; transform: translateY(40px) rotateX(20deg); }
  to   { opacity: 1; transform: translateY(0) rotateX(0deg); }
}
@keyframes backdropFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

let cardStyleInjected = false;
function injectCardStyle() {
  if (cardStyleInjected || typeof document === 'undefined') return;
  cardStyleInjected = true;
  const el = document.createElement('style');
  el.textContent = CARD_STYLE;
  document.head.appendChild(el);
}

interface CardModalProps {
  tileType: 'Chance' | 'CommunityChest';
  dispatch: (a: Action) => void;
}

export function CardModal({ tileType, dispatch }: CardModalProps) {
  injectCardStyle();

  const isChance = tileType === 'Chance';
  const cardColor = isChance ? '#f59e0b' : '#3b82f6';
  const cardBg = isChance
    ? 'linear-gradient(160deg, #451a03 0%, #78350f 100%)'
    : 'linear-gradient(160deg, #0c1a3a 0%, #1e3a8a 100%)';

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 300,
        backdropFilter: 'blur(4px)',
        animation: 'backdropFadeIn 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 320,
          background: cardBg,
          border: `2px solid ${cardColor}`,
          borderRadius: 20,
          padding: '32px 28px',
          textAlign: 'center',
          animation: 'cardSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: `0 0 60px ${cardColor}33, 0 24px 60px rgba(0,0,0,0.8)`,
          perspective: '800px',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {isChance ? '?' : '🏛'}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: 2,
            color: cardColor, marginBottom: 16, textTransform: 'uppercase',
          }}>
            {isChance ? 'Chance' : 'Community Chest'}
          </div>
          <p style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.6, marginBottom: 24 }}>
            Draw a card to see your fate...
          </p>
          <button
            onClick={() => dispatch({ type: 'DRAW_CARD' })}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 12,
              border: `1px solid ${cardColor}`,
              background: `${cardColor}22`,
              color: cardColor,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Draw Card →
          </button>
        </div>
      </div>
    </>
  );
}
