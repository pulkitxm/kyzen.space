"use client";

import { getGameSkeleton } from "@gamelobby/games-client";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaUserPlus } from "react-icons/fa6";
import { clientFetch, clientFetchJson } from "@/lib/api-client";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

type Peek = {
  gameType: string | null;
  inviter: { username: string; avatar: unknown } | null;
  expired: boolean;
};

type Accept = {
  gameId: string | null;
  selfInvite: boolean;
  inviter: { username: string; avatar: unknown } | null;
};

export function InviteFlow({ token }: { token: string }) {
  const router = useRouter();
  const { socket } = useSocket();

  const [peek, setPeek] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<"idle" | "sent" | "busy">(
    "idle",
  );
  const acceptStarted = useRef(false);
  const inviterName = peek?.inviter?.username ?? null;

  useEffect(() => {
    let cancelled = false;
    void clientFetchJson<Peek>(`/api/invite/${token}`)
      .then((p) => {
        if (!cancelled) setPeek(p);
      })
      .catch(() => {
        if (!cancelled)
          setPeek({ gameType: null, inviter: null, expired: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (acceptStarted.current) return;
    if (!peek || peek.expired) return;
    acceptStarted.current = true;

    let cancelled = false;
    void clientFetch(`/api/invite/${token}/accept`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
        return (await res.json()) as Accept;
      })
      .then((result) => {
        if (cancelled) return;
        if (result.gameId && !result.selfInvite) {
          router.replace(`/play/${result.gameId}`);
        } else {
          router.replace("/games");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not join the game");
      });
    return () => {
      cancelled = true;
    };
  }, [peek, token, router]);

  const addFriend = useCallback(async () => {
    if (!inviterName || !socket) return;
    setFriendStatus("busy");
    try {
      await emitAck(socket, CHAT_EVENTS.friendRequest, {
        username: inviterName,
      });
      setFriendStatus("sent");
    } catch {
      setFriendStatus("idle");
    }
  }, [inviterName, socket]);

  if (peek?.expired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-semibold text-foreground text-lg">
          This invite link has expired
        </p>
        <button
          type="button"
          onClick={() => router.replace("/games")}
          className="rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm"
        >
          Browse games
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-semibold text-danger text-lg">{error}</p>
        <button
          type="button"
          onClick={() => router.replace("/games")}
          className="rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm"
        >
          Browse games
        </button>
      </div>
    );
  }

  const Skeleton = getGameSkeleton(peek?.gameType ?? "");

  return (
    <div className="relative min-h-screen">
      <AnimatePresence>
        <m.div
          key="invite-skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6"
        >
          <p className="text-center text-muted-foreground text-sm">
            {inviterName
              ? `Joining ${inviterName}'s game…`
              : "Joining the game…"}
          </p>
          <Skeleton />
        </m.div>
      </AnimatePresence>

      {inviterName ? (
        <div className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
          <p className="text-card-foreground text-sm">
            {inviterName} invited you
          </p>
          <button
            type="button"
            disabled={friendStatus !== "idle"}
            onClick={addFriend}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs outline-none transition hover:opacity-90 disabled:opacity-50"
          >
            <FaUserPlus size={14} aria-hidden="true" />
            {friendStatus === "sent" ? "Request sent" : "Add as friend"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
