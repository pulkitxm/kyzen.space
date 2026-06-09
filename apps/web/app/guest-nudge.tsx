"use client";

import { useCallback, useState } from "react";
import { FaGoogle } from "react-icons/fa6";
import { authClient } from "@/lib/auth-client";

export function GuestNudge({ isAnonymous }: { isAnonymous: boolean }) {
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/profile`,
      });
    } catch {
      setBusy(false);
    }
  }, []);

  if (!isAnonymous) return null;

  return (
    <div className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
      <p className="text-card-foreground text-sm">Sign in to save your games</p>
      <button
        type="button"
        disabled={busy}
        onClick={signIn}
        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs outline-none transition hover:opacity-90 disabled:opacity-50"
      >
        <FaGoogle size={14} aria-hidden="true" />
        {busy ? "Redirecting…" : "Sign in"}
      </button>
    </div>
  );
}
