"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FaUser } from "react-icons/fa6";
import { ensureIdentity } from "@/lib/auth/ensure-identity";

export function GuestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueAsGuest = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await ensureIdentity();
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not start a guest session",
      );
      setBusy(false);
    }
  }, [router]);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={continueAsGuest}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
      >
        <FaUser size={16} className="shrink-0" aria-hidden="true" />
        {busy ? "Starting…" : "Continue as a guest"}
      </button>
      {error ? (
        <p className="mt-4 text-center text-danger text-xs">{error}</p>
      ) : null}
    </>
  );
}
