"use client";

import { CHAT_EVENTS, type ConversationJson } from "@gamelobby/chat-core";
import { listGameMeta } from "@gamelobby/games-core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaGamepad } from "react-icons/fa6";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

export function GameLauncher({
  conversation,
  userId,
  gameType = listGameMeta()[0]?.type ?? "",
}: {
  conversation: ConversationJson;
  userId: string;
  gameType?: string;
}) {
  const { socket } = useSocket();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const gameName =
    listGameMeta().find((m) => m.type === gameType)?.name ?? "Game";
  const isGroup = conversation.kind === "group";
  const others = conversation.members.filter((m) => m.id !== userId);

  const create = async (
    seatingMode?: "open" | "challenge",
    challengedUserId?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await emitAck<{ game: { id: string } }>(
        socket,
        CHAT_EVENTS.createGameInConversation,
        {
          conversationId: conversation.id,
          gameType,
          seatingMode,
          challengedUserId,
        },
      );
      setOpen(false);
      router.push(`/play/${res.game.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      {open && isGroup ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-xl border border-border bg-card p-1 shadow-xl">
            <div className="px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {gameName}
            </div>
            <button
              type="button"
              onClick={() => void create("open")}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-overlay"
            >
              Open game · anyone can join
            </button>
            {others.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void create("challenge", m.id)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-overlay"
              >
                Challenge {m.displayName ?? m.username}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => (isGroup ? setOpen((o) => !o) : void create("open"))}
        disabled={busy}
        aria-label="Start a game"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground outline-none transition hover:bg-surface-overlay hover:text-foreground disabled:opacity-50"
      >
        <FaGamepad className="size-5" />
      </button>
    </div>
  );
}
