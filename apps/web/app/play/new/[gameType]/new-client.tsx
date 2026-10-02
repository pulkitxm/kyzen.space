"use client";

import type { GameType } from "@kyzen/shared/types";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { SearchingScreen } from "../../_shared/searching-screen";

export function NewClient({
  gameType,
  gameName,
}: {
  gameType: GameType;
  gameName: string;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const onRoomCreated = useEffectEvent((res: { code: string }) => {
    router.replace(`/play/${res.code}`);
  });

  useEffect(() => {
    if (!socket || startedRef.current) return;
    startedRef.current = true;
    emitAck<{ ok: true; code: string }>(socket, "room:create", { gameType })
      .then((res) => onRoomCreated(res))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not create the room"),
      );
  }, [socket, gameType]);

  if (error) {
    return (
      <SearchingScreen
        title="Couldn't create the room"
        subtitle={error}
        icon={<FaPlus size={26} aria-hidden="true" />}
        spinning={false}
        onCancel={() => router.push(`/games/${gameType}`)}
        cancelLabel="Back"
      />
    );
  }

  return (
    <SearchingScreen
      title="Creating your room..."
      subtitle={gameName}
      icon={<FaPlus size={26} aria-hidden="true" />}
    />
  );
}
