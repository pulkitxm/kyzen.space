"use client";

import { useState } from "react";
import { FaCheck, FaRegCopy } from "react-icons/fa6";
import { cn } from "@/lib/utils";

export function InviteCode({
  gameId,
  compact = false,
}: {
  gameId: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copy = async (kind: "code" | "link") => {
    const value =
      kind === "code"
        ? gameId
        : typeof window !== "undefined"
          ? window.location.href
          : gameId;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-border bg-background text-center font-mono text-foreground",
          compact
            ? "mt-3 py-2 text-2xl tracking-[0.35em]"
            : "mt-4 py-3 text-3xl tracking-[0.4em]",
        )}
      >
        {gameId}
      </div>
      <div className="mt-3 flex gap-2">
        {(["code", "link"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => copy(kind)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied === kind ? (
              <FaCheck size={14} aria-hidden="true" />
            ) : (
              <FaRegCopy size={14} aria-hidden="true" />
            )}
            {copied === kind ? "Copied" : `Copy ${kind}`}
          </button>
        ))}
      </div>
    </>
  );
}
