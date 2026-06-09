"use client";

import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FaArrowRightArrowLeft, FaTrash } from "react-icons/fa6";
import {
  confirmMerge,
  discardMerge,
  getPendingMerge,
  type PendingMerge,
} from "@/lib/account-merge";

export function MergeConsentDialog({
  pending,
  busy,
  onMerge,
  onDiscard,
}: {
  pending: PendingMerge | null;
  busy: boolean;
  onMerge?: () => void;
  onDiscard?: () => void;
}) {
  if (!pending) return null;
  const { games, conversations, friends, statLines } = pending.summary;
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <p className="font-medium text-card-foreground text-sm">
        We found a guest session
      </p>
      <p className="mt-1 text-muted-foreground text-sm">
        {games} games, {conversations} chats, {friends} friends, {statLines}{" "}
        stat lines. Merge into {pending.targetEmail ?? "your account"}?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onMerge}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-sm outline-none transition hover:opacity-90 disabled:opacity-50"
        >
          <FaArrowRightArrowLeft size={14} aria-hidden="true" />
          {busy ? "Merging…" : "Merge"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay disabled:opacity-50"
        >
          <FaTrash size={14} aria-hidden="true" />
          Discard
        </button>
      </div>
    </m.div>
  );
}

export function MergeConsent({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingMerge | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getPendingMerge()
      .then((p) => p)
      .catch(() => null)
      .then((p) => {
        if (active) setPending(p);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const onMerge = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await confirmMerge(pending.id);
      setPending(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [pending, router]);

  const onDiscard = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await discardMerge(pending.id);
      setPending(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [pending, router]);

  return (
    <AnimatePresence>
      {enabled && pending ? (
        <MergeConsentDialog
          pending={pending}
          busy={busy}
          onMerge={onMerge}
          onDiscard={onDiscard}
        />
      ) : null}
    </AnimatePresence>
  );
}
