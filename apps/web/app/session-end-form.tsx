"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientFetch } from "@/lib/api-client";

export function SessionEndForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onEnd = async () => {
    setPending(true);
    try {
      const res = await clientFetch("/api/account/revoke-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        signedOut?: boolean;
      };
      if (data.signedOut) router.push("/auth");
      else router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onEnd}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Ending…" : "End session"}
    </button>
  );
}
