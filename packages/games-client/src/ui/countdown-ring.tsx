"use client";

import { type ReactNode, useEffect, useRef } from "react";

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
  const circleRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const el = circleRef.current;
    if (!el || !active || deadline === null) return;
    const remaining = Math.max(deadline - Date.now(), 0);
    el.style.transition = "none";
    el.style.strokeDashoffset = "0";
    void el.getBoundingClientRect();
    el.style.transition = `stroke-dashoffset ${remaining}ms linear`;
    el.style.strokeDashoffset = `${circumference}`;
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
            ref={circleRef}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
          />
        </svg>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
