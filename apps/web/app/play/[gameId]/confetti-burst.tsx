"use client";

import { m, useReducedMotion } from "motion/react";

const COLORS = [
  "bg-primary",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-sky-400",
  "bg-rose-400",
];

const PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i * 137.5 * Math.PI) / 180;
  const distance = 70 + (i % 5) * 26;
  return {
    id: `confetti-${i}`,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.6 - 50,
    rotate: 160 + (i % 7) * 40,
    duration: 0.9 + (i % 4) * 0.12,
    color: COLORS[i % COLORS.length] ?? "bg-primary",
  };
});

export function ConfettiBurst() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
    >
      {PARTICLES.map((p) => (
        <m.span
          key={p.id}
          className={`absolute top-1/4 left-1/2 h-2 w-1.5 rounded-[1px] ${p.color}`}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: p.y + 140,
            opacity: [1, 1, 0],
            rotate: p.rotate,
          }}
          transition={{ duration: p.duration, ease: [0.12, 0.8, 0.32, 1] }}
        />
      ))}
    </div>
  );
}
