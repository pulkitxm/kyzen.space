"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientFetch } from "@/lib/api-client";

export function SignOutForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSignOut = async () => {
    setPending(true);
    try {
      await clientFetch("/api/account/sign-out", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
