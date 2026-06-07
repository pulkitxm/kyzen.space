"use client";

import type React from "react";
import type { DiceAnimPhase } from "./useGamePhase";

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 22],
    [75, 22],
    [25, 50],
    [75, 50],
    [25, 78],
    [75, 78],
  ],
};

function DieFace({ value, color }: { value: number; color: string }) {
  const pips = (PIPS[value] ?? PIPS[1]) as [number, number][];
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      <title>Die {value}</title>
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="18"
        ry="18"
        fill="var(--card)"
        stroke={color}
        strokeWidth="6"
      />
      {pips.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="10" fill={color} />
      ))}
    </svg>
  );
}

const DICE_STYLE = `
.die-container {
  width: 52px;
  height: 52px;
  perspective: 300px;
  display: inline-block;
  margin: 0 4px;
}
.die-cube {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.3, 1.15);
}
.die-face {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  overflow: hidden;
  backface-visibility: hidden;
  background: var(--card);
}
.die-face.face-1 { transform: rotateY(0deg) translateZ(26px); }
.die-face.face-6 { transform: rotateY(180deg) translateZ(26px); }
.die-face.face-3 { transform: rotateY(-90deg) translateZ(26px); }
.die-face.face-4 { transform: rotateY(90deg) translateZ(26px); }
.die-face.face-2 { transform: rotateX(90deg) translateZ(26px); }
.die-face.face-5 { transform: rotateX(-90deg) translateZ(26px); }

@keyframes dice3dRoll {
  0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
  100% { transform: rotateX(720deg) rotateY(1080deg) rotateZ(360deg); }
}
@keyframes dice3dShake {
  0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg); }
  20% { transform: translate(-4px, 3px) rotateX(-25deg) rotateY(35deg); }
  40% { transform: translate(4px, -3px) rotateX(35deg) rotateY(-25deg); }
  60% { transform: translate(-3px, 4px) rotateX(-20deg) rotateY(45deg); }
  80% { transform: translate(3px, -2px) rotateX(30deg) rotateY(-35deg); }
}

.die-cube.rolling {
  animation: dice3dRoll 0.5s linear infinite;
}
.die-cube.shaking {
  animation: dice3dShake 0.35s ease-in-out infinite;
}
`;

let styleInjected = false;
function injectDiceStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = DICE_STYLE;
  document.head.appendChild(el);
}

const rotationMap: Record<number, { rx: number; ry: number }> = {
  1: { rx: 0, ry: 0 },
  2: { rx: -90, ry: 0 },
  3: { rx: 0, ry: 90 },
  4: { rx: 0, ry: -90 },
  5: { rx: 90, ry: 0 },
  6: { rx: 180, ry: 0 },
};

function Die({
  value,
  phase,
  color,
}: {
  value: number;
  phase: DiceAnimPhase;
  color: string;
}) {
  injectDiceStyle();

  const isRoll = phase === "rolling";
  const isShake = phase === "shaking";
  const rot = rotationMap[value] ?? rotationMap[1]!;

  const style: React.CSSProperties = {};
  if (!isRoll && !isShake) {
    const rx = rot.rx - 12;
    const ry = rot.ry + 12;
    style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  const cubeClasses = `die-cube ${isRoll ? "rolling" : ""} ${isShake ? "shaking" : ""}`;

  return (
    <div className="die-container">
      <div className={cubeClasses} style={style}>
        <div className="die-face face-1"><DieFace value={1} color={color} /></div>
        <div className="die-face face-2"><DieFace value={2} color={color} /></div>
        <div className="die-face face-3"><DieFace value={3} color={color} /></div>
        <div className="die-face face-4"><DieFace value={4} color={color} /></div>
        <div className="die-face face-5"><DieFace value={5} color={color} /></div>
        <div className="die-face face-6"><DieFace value={6} color={color} /></div>
      </div>
    </div>
  );
}

interface DiceProps {
  values: [number, number];
  phase: DiceAnimPhase;
}

export function Dice({ values, phase }: DiceProps) {
  const isDoubles = values[0] === values[1];
  const accentColor = isDoubles ? "var(--primary)" : "var(--accent-warm)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Die value={values[0] ?? 1} phase={phase} color={accentColor} />
        <span
          style={{
            color: "var(--muted-foreground)",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          +
        </span>
        <Die value={values[1] ?? 1} phase={phase} color={accentColor} />
      </div>

      {(phase === "settled" || phase === "settling") && isDoubles && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--primary)",
            letterSpacing: 1,
            animation: "diceFadeIn 0.3s ease",
          }}
        >
          🎯 Doubles!
        </div>
      )}
    </div>
  );
}
