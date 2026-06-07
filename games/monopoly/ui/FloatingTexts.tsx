"use client";

import React, { useEffect, useRef } from "react";
import type { FloatingText } from "./useGamePhase";

const FLOAT_STYLE = `
@keyframes floatUp {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  60%  { opacity: 1; transform: translateY(-28px) scale(1.1); }
  100% { opacity: 0; transform: translateY(-48px) scale(0.9); }
}
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = FLOAT_STYLE;
  document.head.appendChild(el);
}

interface FloatingTextsProps {
  texts: FloatingText[];
  boardSize: number;
}

export function FloatingTexts({ texts, boardSize }: FloatingTextsProps) {
  injectStyle();

  const cellSize = boardSize / 9;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      {texts.map((ft) => {
        const left = (ft.col + 0.5) * cellSize;
        const top = (ft.row + 0.5) * cellSize;
        return (
          <div
            key={ft.id}
            style={{
              position: "absolute",
              left,
              top,
              transform: "translate(-50%, -50%)",
              color: ft.color,
              fontWeight: 800,
              fontSize: 15,
              textShadow: `0 0 8px ${ft.color}88`,
              animation: "floatUp 1.8s ease-out forwards",
              whiteSpace: "nowrap",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {ft.text}
          </div>
        );
      })}
    </div>
  );
}

export function useBoardSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState(600);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize(rect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
