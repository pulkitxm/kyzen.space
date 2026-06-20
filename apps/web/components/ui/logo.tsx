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
          <stop offset="0" style={{ stopColor: "var(--logo-mark)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-mark-deep)" }} />
        </linearGradient>
      </defs>
      <rect
        x="6"
        y="6"
        width="52"
        height="52"
        rx="16"
        fill={`url(#${gradientId})`}
      />
      <g className="text-primary-foreground" fill="currentColor">
        <rect x="14" y="38" width="12" height="12" rx="3.5" />
        <rect x="26" y="30" width="12" height="12" rx="3.5" />
        <rect x="38" y="22" width="12" height="12" rx="3.5" />
      </g>
      <circle
        className="text-logo-ring"
        cx="48"
        cy="17"
        r="4.2"
        fill="currentColor"
      />
    </svg>
  );
}

function LogoWordmark() {
  return (
    <span className="font-extrabold leading-none tracking-tight">
      ky
      <span className="text-logo-mark">zen</span>
      <span className="font-semibold opacity-60">.space</span>
    </span>
  );
}

export function Logo({
  variant = "full",
  className,
  iconClassName,
  label = "Kyzen",
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
