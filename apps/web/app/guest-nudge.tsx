"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FaGoogle, FaXmark } from "react-icons/fa6";
import { GlassPane } from "@/components/glass/glass-pane";
import { authClient } from "@/lib/auth-client";
import {
  decideGuestNudge,
  GUEST_SEEN_KEY,
  GUEST_SNOOZE_KEY,
  GUEST_SNOOZE_MS,
} from "@/lib/guest-nudge";

let cachedDecision: { show: boolean; markSeen: boolean } | null = null;

function readDecision() {
  cachedDecision ??= decideGuestNudge({
    isAnonymous: true,
    seen: localStorage.getItem(GUEST_SEEN_KEY),
    snoozedUntil: Number(localStorage.getItem(GUEST_SNOOZE_KEY) ?? 0),
    now: Date.now(),
  });
  return cachedDecision;
}

export function GuestNudge() {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = useSyncExternalStore(
    () => () => {},
    () => readDecision().show,
    () => false,
  );

  useEffect(() => {
    if (readDecision().markSeen) {
      localStorage.setItem(GUEST_SEEN_KEY, String(Date.now()));
    }
  }, []);

  const open = show && !dismissed;

  const dismiss = useCallback(() => {
    localStorage.setItem(
      GUEST_SNOOZE_KEY,
      String(Date.now() + GUEST_SNOOZE_MS),
    );
    setDismissed(true);
  }, []);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="glass-scrim absolute inset-0 bg-black/40"
      />
      <GlassPane className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          className="absolute top-3 right-3 text-muted-foreground transition hover:text-foreground"
        >
          <FaXmark size={16} aria-hidden="true" />
        </button>
        <h2 className="font-semibold text-card-foreground text-lg">
          Welcome back!
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Sign in to save your games, chats, and friends to your account so you
          never lose them.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={signIn}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm outline-none transition hover:opacity-90 disabled:opacity-50"
        >
          <FaGoogle size={16} aria-hidden="true" />
          {busy ? "Redirecting…" : "Sign in with Google"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-xl px-4 py-2 text-muted-foreground text-sm transition hover:text-foreground"
        >
          Maybe later
        </button>
      </GlassPane>
    </div>
  );
}
