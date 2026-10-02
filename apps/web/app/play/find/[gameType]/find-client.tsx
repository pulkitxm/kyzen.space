"use client";

import type { GameType, ServerMatchFoundPayload } from "@kyzen/shared/types";
import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";
import { SearchingScreen } from "../../_shared/searching-screen";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FindClient({
  gameType,
  gameName,
}: {
  gameType: GameType;
  gameName: string;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const setMatchmaking = useSetAtom(matchmakingAtom);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const matchedRef = useRef(false);

  useSocketEvent<ServerMatchFoundPayload>("match_found", (payload) => {
    if (!payload?.gameId || matchedRef.current) return;
    matchedRef.current = true;
    setMatchmaking({ searching: null });
    router.replace(`/play/${payload.gameId}`);
  });

  const join = useCallback(async () => {
    if (!socket?.connected || matchedRef.current) return;
    try {
      const result = await emitAck<{ ok: true; gameId: string | null }>(
        socket,
        "game:queue_join",
        { gameType },
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
  }, [socket, gameType, router, setMatchmaking]);

  useEffect(() => {
    if (!socket) return;
    void join();
    socket.on("connect", join);
    const heartbeat = setInterval(join, 10000);
    setMatchmaking({ searching: gameType });
    return () => {
      clearInterval(heartbeat);
      socket.off("connect", join);
      socket.emit("game:queue_leave", { gameType });
      setMatchmaking({ searching: null });
    };
  }, [socket, gameType, setMatchmaking, join]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <SearchingScreen
      title="Finding you an opponent..."
      subtitle={
        error ??
        `${gameName} · ${formatElapsed(elapsed)} · Anonymous public match`
      }
      icon={<FaMagnifyingGlass size={26} aria-hidden="true" />}
      onCancel={() => void cancel()}
    />
  );
}
