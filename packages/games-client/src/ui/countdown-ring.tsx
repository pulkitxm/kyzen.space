"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export function CountdownRing({
  deadline,
  active,
  size = 44,
  stroke = 3,
  children,
}: {
  deadline: number | null;
  active: boolean;
  size?: number;
  stroke?: number;
  children: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!active || deadline === null) {
      setDuration(0);
      setOffset(0);
      return;
    }
    const remaining = Math.max(deadline - Date.now(), 0);
    setDuration(0);
    setOffset(0);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setDuration(remaining);
        setOffset(circumference);
      });
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [deadline, active, circumference]);

  const showRing = active && deadline !== null;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {showRing ? (
        <svg
          className="pointer-events-none absolute inset-0 -rotate-90 text-primary"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: `stroke-dashoffset ${duration}ms linear` }}
          />
        </svg>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
