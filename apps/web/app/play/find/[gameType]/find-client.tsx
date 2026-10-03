"use client";

import type {
  GameType,
  PublicQueue,
  ServerMatchFoundPayload,
} from "@kyzen/shared/types";
import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import { initialQueueId, queueJoinPayload } from "@/lib/games/queues";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";
import { SearchingScreen } from "../../_shared/searching-screen";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FindClient({
  gameType,
  gameName,
  queues,
  requestedQueue,
}: {
  gameType: GameType;
  gameName: string;
  queues: PublicQueue[];
  requestedQueue: string | null;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const setMatchmaking = useSetAtom(matchmakingAtom);
  const [queueId, setQueueId] = useState(() =>
    initialQueueId(queues, requestedQueue),
  );
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const matchedRef = useRef(false);
  const queue = queues.find((entry) => entry.id === queueId) ?? null;
  const queueKey = queues.length ? (queue?.id ?? null) : gameType;
  const searching = queueKey !== null;

  useSocketEvent<ServerMatchFoundPayload>("match_found", (payload) => {
    if (!payload?.gameId || matchedRef.current) return;
    matchedRef.current = true;
    setMatchmaking({ searching: null });
    router.replace(`/play/${payload.gameId}`);
  });

  const join = useEffectEvent(async () => {
    if (!socket?.connected || matchedRef.current) return;
    try {
      const result = await emitAck<{ ok: true; gameId: string | null }>(
        socket,
        "game:queue_join",
        queueJoinPayload(gameType, queue),
      );
      setError(null);
      if (result.gameId && !matchedRef.current) {
        matchedRef.current = true;
        setMatchmaking({ searching: null });
        router.replace(`/play/${result.gameId}`);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Matchmaking failed. Retrying...",
      );
    }
  });

  useEffect(() => {
    if (!socket || !queueKey) return;
    void join();
  }, [socket, queueKey]);

  useEffect(() => {
    if (!socket || !searching) return;
    const rejoin = () => void join();
    socket.on("connect", rejoin);
    const heartbeat = setInterval(rejoin, 10000);
    setMatchmaking({ searching: gameType });
    return () => {
      clearInterval(heartbeat);
      socket.off("connect", rejoin);
      socket.emit("game:queue_leave", { gameType });
      setMatchmaking({ searching: null });
    };
  }, [socket, gameType, searching, setMatchmaking]);

  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);

  const choose = (id: string) => {
    if (id === queueId) return;
    setQueueId(id);
    setElapsed(0);
    setError(null);
  };

  const cancel = async () => {
    matchedRef.current = true;
    setMatchmaking({ searching: null });
    try {
      const result = socket?.connected
        ? await emitAck<{ ok: true; gameId: string | null }>(
            socket,
            "game:queue_leave",
            { gameType },
          )
        : null;
      router.replace(
        result?.gameId ? `/play/${result.gameId}` : `/games/${gameType}`,
      );
    } catch {
      matchedRef.current = false;
      setError("Could not cancel. Reconnect and try again.");
    }
  };

  if (!searching) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-1">
          <h1 className="font-semibold text-foreground text-lg">
            Choose a match
          </h1>
          <p className="text-muted-foreground text-sm">
            {gameName} · Anonymous public match
          </p>
        </div>
        <QueueOptions queues={queues} selected={null} onChoose={choose} />
        <button
          type="button"
          onClick={() => router.push(`/games/${gameType}`)}
          className="rounded-xl border border-border px-5 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <SearchingScreen
      title={
        queue
          ? `Finding a ${queue.label} match...`
          : "Finding you an opponent..."
      }
      subtitle={
        error ??
        `${gameName} · ${formatElapsed(elapsed)} · Anonymous public match`
      }
      icon={<FaMagnifyingGlass size={26} aria-hidden="true" />}
      onCancel={() => void cancel()}
    >
      {queues.length > 1 ? (
        <QueueOptions
          queues={queues}
          selected={queueId}
          onChoose={choose}
          compact
        />
      ) : null}
    </SearchingScreen>
  );
}

function QueueOptions({
  queues,
  selected,
  onChoose,
  compact = false,
}: {
  queues: PublicQueue[];
  selected: string | null;
  onChoose: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className="w-full max-w-sm">
      <legend className="sr-only">Match type</legend>
      <div
        className={cn(
          "grid gap-2",
          compact ? "auto-cols-fr grid-flow-col" : "gap-3",
        )}
      >
        {queues.map((option) => {
          const active = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChoose(option.id)}
              className={cn(
                "flex flex-col items-center rounded-2xl border px-4 font-medium text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                compact ? "py-2" : "gap-1 py-4",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-raised text-card-foreground hover:bg-surface-overlay",
              )}
            >
              <span className={compact ? undefined : "font-semibold text-base"}>
                {option.label}
              </span>
              {compact ? null : (
                <span className="text-muted-foreground text-xs">
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
