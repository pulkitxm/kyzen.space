'use client';

import React, { useReducer, useCallback, useState } from 'react';
import type { GameState, Action } from './types';
import { createInitialState } from './constants/initialState';
import { applyAction } from './engine/applyAction';
import { Board } from './ui/Board';
import { Controls } from './ui/Controls';

// ─── Reducer ──────────────────────────────────────────────────────────────────

function monopolyReducer(state: GameState, action: Action): GameState {
  return applyAction(state, action);
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function Setup({ onStart }: { onStart: (names: string[]) => void }) {
  const [names, setNames] = useState<string[]>(['Player 1', 'Player 2']);

  const addPlayer = () => {
    if (names.length < 8) setNames([...names, `Player ${names.length + 1}`]);
  };
  const removePlayer = (i: number) => {
    if (names.length > 2) setNames(names.filter((_, idx) => idx !== i));
  };

  return (
    <div style={styles.centered}>
      <h1 style={styles.title}>🎩 Monopoly</h1>
      <p style={styles.subtitle}>Set up your game</p>

      {names.map((name, i) => (
        <div key={i} style={styles.inputRow}>
          <input
            value={name}
            onChange={(e) => {
              const updated = [...names];
              updated[i] = e.target.value;
              setNames(updated);
            }}
            style={styles.input}
            placeholder={`Player ${i + 1}`}
          />
          {names.length > 2 && (
            <button onClick={() => removePlayer(i)} style={styles.removeBtn}>✕</button>
          )}
        </div>
      ))}

      {names.length < 8 && (
        <button onClick={addPlayer} style={styles.addBtn}>+ Add Player</button>
      )}

      <button
        onClick={() => onStart(names.filter(Boolean))}
        style={styles.startBtn}
        disabled={names.filter(Boolean).length < 2}
      >
        Start Game
      </button>
    </div>
  );
}

// ─── Game Log ─────────────────────────────────────────────────────────────────

function GameLog({ log }: { log: ReadonlyArray<string> }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);
  return (
    <div ref={ref} style={styles.log}>
      {log.map((msg, i) => (
        <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #1f2937', fontSize: 11, color: '#9ca3af' }}>
          {msg}
        </div>
      ))}
    </div>
  );
}

// ─── Main game ────────────────────────────────────────────────────────────────

function MonopolyGame({ playerNames }: { playerNames: string[] }) {
  const [state, dispatch] = useReducer(monopolyReducer, undefined, () =>
    createInitialState(playerNames)
  );

  const handleRoll = useCallback(() => {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    dispatch({ type: 'ROLL_DICE', payload: { die1, die2 } });
  }, []);

  return (
    <div style={styles.gameRoot}>
      {/* Board */}
      <div style={styles.boardArea}>
        <Board state={state} />
      </div>

      {/* Controls + Log */}
      <div style={styles.sidebar}>
        {state.winnerId && (
          <div style={styles.winBanner}>
            🏆 {state.players.find((p) => p.id === state.winnerId)?.name} wins!
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Controls state={state} dispatch={dispatch} onRoll={handleRoll} />
        </div>
        <GameLog log={state.log} />
      </div>
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
    <div style={styles.page}>
      <button
        onClick={() => { setPlayerNames(null); setKey((k) => k + 1); }}
        style={styles.resetBtn}
      >
        ↩ New Game
      </button>
      <MonopolyGame key={key} playerNames={playerNames} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0e1a',
    color: '#e5e7eb',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#0a0e1a',
    color: '#e5e7eb',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 900,
    background: 'linear-gradient(135deg, #60a5fa, #818cf8, #c084fc)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: { color: '#6b7280', margin: 0, fontSize: 14 },
  inputRow: { display: 'flex', gap: 8, width: '100%', maxWidth: 320 },
  input: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #374151',
    background: '#111827',
    color: '#e5e7eb',
    fontSize: 14,
    outline: 'none',
  },
  removeBtn: {
    padding: '0 12px',
    borderRadius: 8,
    border: 'none',
    background: '#374151',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 14,
  },
  addBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: '1px dashed #374151',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: 13,
    width: '100%',
    maxWidth: 320,
  },
  startBtn: {
    padding: '12px 32px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    marginTop: 8,
    width: '100%',
    maxWidth: 320,
  },
  gameRoot: {
    flex: 1,
    display: 'flex',
    gap: 16,
    padding: 16,
    overflow: 'hidden',
    height: 'calc(100vh - 48px)',
  },
  boardArea: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sidebar: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflowY: 'auto',
    minWidth: 280,
    maxWidth: 380,
  },
  log: {
    background: '#111827',
    borderRadius: 8,
    padding: 10,
    maxHeight: 180,
    overflowY: 'auto',
    border: '1px solid #1f2937',
    flexShrink: 0,
  },
  winBanner: {
    background: 'linear-gradient(135deg, #854d0e, #ca8a04)',
    borderRadius: 10,
    padding: '12px 16px',
    fontWeight: 700,
    fontSize: 18,
    textAlign: 'center',
    color: '#fef9c3',
  },
  resetBtn: {
    alignSelf: 'flex-start',
    margin: '8px 16px',
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid #374151',
    background: '#1f2937',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 12,
  },
};
