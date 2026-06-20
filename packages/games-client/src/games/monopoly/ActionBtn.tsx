"use client";

import type React from "react";

const ACTION_BTN_BASE_STYLE: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 12,
  transition: "transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
  letterSpacing: 0.3,
  whiteSpace: "nowrap",
};

export function ActionBtn({
  label,
  onClick,
  disabled = false,
  color = "var(--primary)",
  variant = "solid",
  fullWidth = false,
}: {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  variant?: "solid" | "outline";
  fullWidth?: boolean;
}) {
  const isVar = color.startsWith("var(--");
  const foregroundColor = disabled
    ? "var(--muted-foreground)"
    : variant === "solid"
      ? color === "var(--primary)"
        ? "var(--primary-foreground)"
        : color === "var(--success)"
          ? "var(--success-foreground)"
          : color === "var(--warning)"
            ? "var(--warning-foreground)"
            : color === "var(--danger)"
              ? "var(--danger-foreground)"
              : "#fff"
      : color;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...ACTION_BTN_BASE_STYLE,
        border:
          variant === "outline"
            ? `1px solid ${disabled ? "var(--border)" : `color-mix(in srgb, ${color} 40%, transparent)`}`
            : "none",
        background: disabled
          ? "var(--surface)"
          : variant === "solid"
            ? isVar
              ? color
              : `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 80%, black))`
            : `color-mix(in srgb, ${color} 10%, transparent)`,
        color: foregroundColor,
        cursor: disabled ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
