"use client";

import type {
  GameType,
  ServerMatchFoundPayload,
} from "@gamelobby/shared/types";
import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";
import { useSocket, useSocketEvent } from "@/lib/socket/socket-context";
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
  const matchedRef = useRef(false);

  useSocketEvent<ServerMatchFoundPayload>("match_found", (payload) => {
    if (!payload?.gameId || matchedRef.current) return;
    matchedRef.current = true;
    setMatchmaking({ searching: null });
    router.replace(`/play/${payload.gameId}`);
  });

  useEffect(() => {
    if (!socket) return;
    socket.emit("game:queue_join", { gameType });
    setMatchmaking({ searching: gameType });
    return () => {
      if (!matchedRef.current) socket.emit("game:queue_leave", { gameType });
      setMatchmaking({ searching: null });
    };
  }, [socket, gameType, setMatchmaking]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cancel = () => {
    matchedRef.current = true;
    setMatchmaking({ searching: null });
    socket?.emit("game:queue_leave", { gameType });
    router.push(`/games/${gameType}`);
  };

  return (
    <SearchingScreen
      title="Finding you an opponent..."
      subtitle={`${gameName} · ${formatElapsed(elapsed)}`}
      icon={<FaMagnifyingGlass size={26} aria-hidden="true" />}
      onCancel={cancel}
    />
  );
}
