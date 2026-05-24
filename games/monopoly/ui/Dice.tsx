'use client';

import React from 'react';
import type { DiceAnimPhase } from './useGamePhase';

// ─── SVG pip layouts per face ─────────────────────────────────────────────────

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 22], [75, 22], [25, 50], [75, 50], [25, 78], [75, 78]],
};

function DieFace({ value, color }: { value: number; color: string }) {
  const pips = PIPS[value] ?? PIPS[1];
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect x="2" y="2" width="96" height="96" rx="16" ry="16"
        fill="#1e2235" stroke={color} strokeWidth="3" />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill={color} />
      ))}
    </svg>
  );
}

// ─── CSS animation keyframes (injected once) ──────────────────────────────────

const DICE_STYLE = `
@keyframes diceShake {
  0%   { transform: translate(0, 0) rotate(0deg); }
  15%  { transform: translate(-4px, 3px) rotate(-8deg); }
  30%  { transform: translate(4px, -3px) rotate(8deg); }
  45%  { transform: translate(-3px, 4px) rotate(-5deg); }
  60%  { transform: translate(3px, -2px) rotate(5deg); }
  75%  { transform: translate(-2px, 3px) rotate(-3deg); }
  90%  { transform: translate(2px, -2px) rotate(3deg); }
  100% { transform: translate(0, 0) rotate(0deg); }
}
@keyframes diceRoll {
  0%   { transform: rotate(0deg) scale(1); }
  25%  { transform: rotate(180deg) scale(1.1); }
  50%  { transform: rotate(360deg) scale(0.9); }
  75%  { transform: rotate(540deg) scale(1.05); }
  100% { transform: rotate(720deg) scale(1); }
}
@keyframes diceBounce {
  0%   { transform: translateY(0) scale(1); }
  30%  { transform: translateY(-6px) scale(1.05); }
  60%  { transform: translateY(3px) scale(0.97); }
  80%  { transform: translateY(-2px) scale(1.02); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes diceGlow {
  0%, 100% { filter: drop-shadow(0 0 6px currentColor); }
  50%       { filter: drop-shadow(0 0 14px currentColor); }
}
`;

let styleInjected = false;
function injectDiceStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = DICE_STYLE;
  document.head.appendChild(el);
}

// ─── Single die ───────────────────────────────────────────────────────────────

function Die({ value, phase, color }: { value: number; phase: DiceAnimPhase; color: string }) {
  injectDiceStyle();

  const animation: React.CSSProperties = (() => {
    switch (phase) {
      case 'shaking':  return { animation: 'diceShake 0.4s ease-in-out infinite' };
      case 'rolling':  return { animation: 'diceRoll 0.6s cubic-bezier(0.25,0.46,0.45,0.94) infinite' };
      case 'settling': return { animation: 'diceBounce 0.3s ease-out forwards' };
      case 'settled':  return { animation: 'diceGlow 1.5s ease-in-out infinite', color };
      default:         return {};
    }
  })();

  return (
    <div style={{ width: 52, height: 52, ...animation }}>
      <DieFace value={value} color={phase === 'idle' ? '#4b5563' : color} />
    </div>
  );
}

// ─── Dice pair component ──────────────────────────────────────────────────────

interface DiceProps {
  values: [number, number];
  phase: DiceAnimPhase;
}

export function Dice({ values, phase }: DiceProps) {
  const sum = values[0] + values[1];
  const isDoubles = values[0] === values[1];
  const accentColor = isDoubles ? '#a78bfa' : '#60a5fa';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Die value={values[0]} phase={phase} color={accentColor} />
        <span style={{ color: '#4b5563', fontSize: 18, fontWeight: 700 }}>+</span>
        <Die value={values[1]} phase={phase} color={accentColor} />
      </div>

      {(phase === 'settled' || phase === 'settling') && isDoubles && (
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: 1,
          animation: 'diceFadeIn 0.3s ease',
        }}>
          🎯 Doubles!
        </div>
      )}
    </div>
  );
}
