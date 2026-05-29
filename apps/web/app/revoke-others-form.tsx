"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientFetch } from "@/lib/api-client";

export function RevokeOthersForm({
  otherSessionCount,
}: {
  otherSessionCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onRevoke = async () => {
    setPending(true);
    try {
      await clientFetch("/api/account/revoke-others", { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onRevoke}
      disabled={otherSessionCount === 0 || pending}
      className="mt-3 inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? "Revoking…"
        : `Revoke other sessions (${otherSessionCount})`}
    </button>
  );
}
