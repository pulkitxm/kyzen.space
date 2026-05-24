'use client';

import React, { useReducer, useState } from 'react';
import type { GameState, Action, Tile } from './types';
import { createInitialState } from './constants/initialState';
import { applyAction } from './engine/applyAction';
import { Board } from './ui/Board';
import { Controls } from './ui/Controls';
import { FloatingTexts, useBoardSize } from './ui/FloatingTexts';
import { PropertyPanel } from './ui/PropertyPanel';
import { useGamePhase } from './ui/useGamePhase';

// ─── Reducer ──────────────────────────────────────────────────────────────────

function monopolyReducer(state: GameState, action: Action): GameState {
  return applyAction(state, action);
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

const TOKENS = ['🎩', '🚂', '🐕', '🚗', '⛵', '🎸', '👟', '🐈'];

function Setup({ onStart }: { onStart: (names: string[]) => void }) {
  const [names, setNames] = useState<string[]>(['Player 1', 'Player 2']);
  const [showRules, setShowRules] = useState(false);

  const addPlayer = () => {
    if (names.length < 8) setNames([...names, `Player ${names.length + 1}`]);
  };
  const removePlayer = (i: number) => {
    if (names.length > 2) setNames(names.filter((_, idx) => idx !== i));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 30% 40%, #0f1e3d 0%, #080c18 70%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: 24,
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(59,130,246,0.12) 0%, transparent 70%)',
      }} />

      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #1e2540',
        borderRadius: 20,
        padding: '40px 36px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 40px 80px rgba(0,0,0,0.7)',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎩</div>
          <h1 style={{
            fontSize: 36, fontWeight: 900, margin: 0,
            background: 'linear-gradient(135deg, #60a5fa, #818cf8, #c084fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: -1,
          }}>
            Monopoly
          </h1>
          <p style={{ color: '#4b5563', margin: '6px 0 0', fontSize: 14 }}>
            Add players to begin
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {names.map((name, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid #1e2540',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                {TOKENS[i % TOKENS.length]}
              </div>
              <input
                value={name}
                onChange={(e) => {
                  const updated = [...names];
                  updated[i] = e.target.value;
                  setNames(updated);
                }}
                style={{
                  flex: 1, padding: '10px 14px',
                  borderRadius: 10, border: '1px solid #1e2540',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit',
                }}
                placeholder={`Player ${i + 1}`}
              />
              {names.length > 2 && (
                <button
                  onClick={() => removePlayer(i)}
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    border: '1px solid #1e2540',
                    background: 'rgba(239,68,68,0.1)',
                    color: '#f87171', cursor: 'pointer', fontSize: 14,
                    flexShrink: 0,
                  }}
                >✕</button>
              )}
            </div>
          ))}
        </div>

        {names.length < 8 && (
          <button
            onClick={addPlayer}
            style={{
              width: '100%', marginTop: 12,
              padding: '10px 0',
              borderRadius: 10,
              border: '1px dashed #1e2540',
              background: 'transparent',
              color: '#4b5563', fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + Add Player
          </button>
        )}

        <button
          onClick={() => onStart(names.filter(Boolean))}
          disabled={names.filter(Boolean).length < 2}
          style={{
            width: '100%', marginTop: 16,
            padding: '14px 0',
            borderRadius: 12, border: 'none',
            background: names.filter(Boolean).length < 2
              ? '#0f1428'
              : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: names.filter(Boolean).length < 2 ? '#2d3748' : '#fff',
            fontWeight: 800, fontSize: 16,
            cursor: names.filter(Boolean).length < 2 ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: names.filter(Boolean).length >= 2
              ? '0 8px 24px rgba(59,130,246,0.4)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Start Game →
        </button>

        <button
          onClick={() => setShowRules(true)}
          style={{
            width: '100%', marginTop: 12,
            padding: '10px 0',
            borderRadius: 10,
            border: '1px solid #1e2540',
            background: 'rgba(255,255,255,0.02)',
            color: '#94a3b8', fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          📖 How to Play & Rules
        </button>
      </div>

      {showRules && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 500, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 500,
            background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #334155',
            borderRadius: 20,
            padding: '30px 36px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            position: 'relative',
          }}>
            <h2 style={{
              margin: '0 0 16px 0',
              fontSize: 24, fontWeight: 800,
              background: 'linear-gradient(135deg, #60a5fa, #818cf8)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              📖 Monopoly Rules & How to Play
            </h2>
            <div style={{
              maxHeight: '60vh', overflowY: 'auto',
              color: '#cbd5e1', fontSize: 14, lineHeight: 1.6,
              display: 'flex', flexDirection: 'column', gap: 14,
              paddingRight: 8,
            }}>
              <div>
                <strong style={{ color: '#60a5fa' }}>Goal</strong><br />
                Bankrupt all other players to be the last one standing and win the game!
              </div>
              <div>
                <strong style={{ color: '#60a5fa' }}>Turns & Movement</strong><br />
                Roll the dice to move clockwise around the board. Rolling doubles gives you an extra turn, but rolling doubles 3 times in a row sends you to Jail.
              </div>
              <div>
                <strong style={{ color: '#60a5fa' }}>Buying Properties</strong><br />
                When you land on an unowned Property, Railroad, or Utility, you can buy it for the listed price. If you own the entire color group, you can build houses and hotels to increase rent.
              </div>
              <div>
                <strong style={{ color: '#60a5fa' }}>Rent & Taxes</strong><br />
                Pay rent when landing on another player's property. Rent is higher if they own the full color group, or have houses/hotels. Land on Tax spaces to pay flat fees.
              </div>
              <div>
                <strong style={{ color: '#60a5fa' }}>Jail</strong><br />
                Sent to Jail by landing on Go To Jail, rolling 3 doubles, or drawing a card. Exit by rolling doubles, paying $50, or using a Get Out of Jail Free card.
              </div>
              <div>
                <strong style={{ color: '#60a5fa' }}>Chance & Community Chest</strong><br />
                Land on these spaces to draw cards. You must draw within 3 seconds, and the card's effect will apply to the board after a 2-second reveal.
              </div>
              <div>
                <strong style={{ color: '#60a5fa' }}>Time Limits</strong><br />
                To keep the game moving, you have a 3-second limit to end your turn.
              </div>
            </div>
            <button
              onClick={() => setShowRules(false)}
              style={{
                width: '100%', marginTop: 24,
                padding: '12px 0',
                borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff', fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Game ─────────────────────────────────────────────────────────────────────

function MonopolyGame({ playerNames }: { playerNames: string[] }) {
  const [state, dispatch] = useReducer(monopolyReducer, undefined, () =>
    createInitialState(playerNames)
  );

  const { ref: boardRef, size: boardSize } = useBoardSize();

  const {
    uiPhase, diceAnimPhase, diceDisplay,
    animatedPositions, destinationCell, floatingTexts,
    onRoll, wrappedDispatch,
    cardDrawCountdown, endTurnCountdown, drawnCard, onDrawCard,
  } = useGamePhase(state, dispatch);

  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const mustDrawCard =
    state.turnPhase === 'LANDED' &&
    (currentPlayer && (
      state.board[currentPlayer.position]?.type === 'Chance' ||
      state.board[currentPlayer.position]?.type === 'CommunityChest'
    ));

  const isMoving = uiPhase === 'MOVING';
  const landingPos = uiPhase === 'LANDING' ? currentPlayer?.position ?? null : null;

  return (
    <div style={{
      display: 'flex',
      gap: 20,
      padding: '16px 20px',
      alignItems: 'flex-start',
      minHeight: 'calc(100vh - 56px)',
      overflow: 'auto',
    }}>
      {/* Board area */}
      <div style={{
        flex: '1 1 auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        minWidth: 0,
        position: 'relative',
      }}>
        <Board
          state={state}
          animatedPositions={animatedPositions}
          isMoving={isMoving}
          landingPosition={landingPos}
          destinationCell={destinationCell}
          mustDrawCard={!!mustDrawCard}
          onTileClick={(tile) => setSelectedTile(tile)}
          dispatch={wrappedDispatch}
          boardRef={boardRef}
          boardSize={boardSize}
        />
        <FloatingTexts texts={floatingTexts} boardSize={boardSize} />
      </div>

      {/* Sidebar */}
      <div style={{ flexShrink: 0 }}>
        <Controls
          state={state}
          dispatch={wrappedDispatch}
          onRoll={onRoll}
          uiPhase={uiPhase}
          diceAnimPhase={diceAnimPhase}
          diceDisplay={diceDisplay}
          cardDrawCountdown={cardDrawCountdown}
          endTurnCountdown={endTurnCountdown}
          drawnCard={drawnCard}
          onDrawCard={onDrawCard}
        />
      </div>

      {/* Property panel overlay */}
      {selectedTile && (
        <PropertyPanel
          tile={selectedTile}
          state={state}
          dispatch={wrappedDispatch}
          onClose={() => setSelectedTile(null)}
        />
      )}

      {/* Card modal removed — player clicks the deck on the board */}

      {/* Win banner */}
      {state.winnerId && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          zIndex: 400, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)',
        }}>
          <div style={{
            padding: '48px 56px',
            borderRadius: 24,
            background: 'linear-gradient(160deg, #1a1200 0%, #451a03 100%)',
            border: '2px solid #ca8a04',
            textAlign: 'center',
            boxShadow: '0 0 80px rgba(202,138,4,0.4)',
          }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🏆</div>
            <div style={{
              fontSize: 32, fontWeight: 900,
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {state.players.find((p) => p.id === state.winnerId)?.name} Wins!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function MonopolyPage() {
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);
  const [key, setKey] = useState(0);

  if (!playerNames) {
    return <Setup onStart={setPlayerNames} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, #0f1e3d 0%, #080c18 60%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Top nav */}
      <div style={{
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid #0f1428',
        background: 'rgba(8,12,24,0.8)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎩</span>
          <span style={{
            fontWeight: 800, fontSize: 16,
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Monopoly
          </span>
        </div>
        <button
          onClick={() => { setPlayerNames(null); setKey((k) => k + 1); }}
          style={{
            padding: '6px 14px',
            borderRadius: 8, border: '1px solid #1e2540',
            background: 'rgba(255,255,255,0.04)',
            color: '#6b7280', cursor: 'pointer', fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          ↩ New Game
        </button>
      </div>

      <MonopolyGame key={key} playerNames={playerNames} />
    </div>
  );
}
