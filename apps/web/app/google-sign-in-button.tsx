"use client";

import { useCallback, useState } from "react";
import { FaGoogle } from "react-icons/fa6";
import { authClient } from "@/lib/auth-client";

type Props = {
  googleOAuthReady: boolean;
};

export function GoogleSignInButton({ googleOAuthReady }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueWithGoogle = useCallback(async () => {
    if (!googleOAuthReady) return;
    setError(null);
    setBusy(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/profile`,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }, [googleOAuthReady]);

  return (
    <>
      <button
        type="button"
        disabled={busy || !googleOAuthReady}
        onClick={continueWithGoogle}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3 font-medium text-card-foreground text-sm shadow-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
      >
        <FaGoogle size={18} className="shrink-0" aria-hidden="true" />
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>

      {error ? (
        <p className="mt-4 text-center text-danger text-xs">{error}</p>
      ) : null}
    </>
  );
}
