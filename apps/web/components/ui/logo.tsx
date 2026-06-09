"use client";

import type * as React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoVariant = "full" | "icon" | "text";

type LogoProps = {
  variant?: LogoVariant;
  className?: string;
  iconClassName?: string;
  label?: string;
  decorative?: boolean;
};

function LogoMark({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="6"
          x2="56"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" style={{ stopColor: "var(--color-primary)" }} />
          <stop
            offset="1"
            style={{
              stopColor:
                "color-mix(in srgb, var(--color-primary) 72%, var(--color-primary-dark))",
            }}
          />
        </linearGradient>
      </defs>
      <rect
        x="6"
        y="8"
        width="52"
        height="36"
        rx="13"
        fill={`url(#${gradientId})`}
      />
      <path d="M22 42 L22 56 L36 43 Z" fill={`url(#${gradientId})`} />
      <g
        className="text-primary-foreground"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      >
        <line x1="16" y1="20" x2="26" y2="30" />
        <line x1="26" y1="20" x2="16" y2="30" />
      </g>
      <circle
        className="text-warning"
        cx="43"
        cy="25"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
      />
    </svg>
  );
}

function LogoWordmark() {
  return (
    <span className="font-extrabold leading-none tracking-tight">
      Game
      <span className="text-primary">Lobby</span>
      <span className="font-semibold text-muted-foreground">.space</span>
    </span>
  );
}

export function Logo({
  variant = "full",
  className,
  iconClassName,
  label = "GameLobby.space",
  decorative = false,
}: LogoProps) {
  const accessibility: React.HTMLAttributes<HTMLSpanElement> = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": label };
  return (
    <span
      {...accessibility}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {variant !== "text" ? <LogoMark className={iconClassName} /> : null}
      {variant !== "icon" ? <LogoWordmark /> : null}
    </span>
  );
}
