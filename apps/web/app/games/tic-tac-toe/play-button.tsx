"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientFetch } from "@/lib/api-client";

/**
 * Starts matchmaking for tic-tac-toe. Calls the backend match-allocation
 * endpoint, then navigates to the returned match. Falls back to /auth on 401.
 */
export function PlayButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onPlay = async () => {
    setLoading(true);
    try {
      const res = await clientFetch("/api/matchmaking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameType: "tic-tac-toe" }),
      });
      if (res.status === 401) {
        router.push("/auth");
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const { matchId } = (await res.json()) as { matchId: string };
      router.push(`/games/tic-tac-toe/${matchId}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={loading}
      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Finding a table…" : "Play"}
    </button>
  );
}
