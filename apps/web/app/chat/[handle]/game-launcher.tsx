"use client";

import { listGameMeta } from "@gamelobby/games-core";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type {
  ConversationJson,
  GameMeta,
  GameType,
} from "@gamelobby/shared/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaGamepad } from "react-icons/fa6";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

export function GameLauncher({
  conversation,
  userId,
}: {
  conversation: ConversationJson;
  userId: string;
}) {
  const { socket } = useSocket();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameMeta | null>(null);

  const isGroup = conversation.kind === "group";
  const others = conversation.members.filter((m) => m.id !== userId);
  const games = listGameMeta();

  const handleClose = () => {
    setOpen(false);
    setSelectedGame(null);
  };

  const create = async (
    gameType: GameType,
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
      handleClose();
      router.push(`/play/${res.game.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={handleClose}
          />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-xl border border-border bg-card p-1 shadow-xl">
            {!selectedGame ? (
              <>
                <div className="px-2 py-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                  Start a game
                </div>
                {games.map((g) => (
                  <button
                    key={g.type}
                    type="button"
                    onClick={() => {
                      if (isGroup) {
                        setSelectedGame(g);
                      } else {
                        void create(g.type, "open");
                      }
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-overlay"
                  >
                    {g.name}
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedGame(null)}
                  className="block w-full rounded-lg px-2 py-1 text-left text-[10px] text-muted-foreground outline-none hover:text-foreground"
                >
                  ← Back to games
                </button>
                <div className="mb-1 border-border border-b px-2 py-1 font-semibold text-xs">
                  Play {selectedGame.name}
                </div>
                <button
                  type="button"
                  onClick={() => void create(selectedGame.type, "open")}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-overlay"
                >
                  Open game · anyone can join
                </button>
                {others.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      void create(selectedGame.type, "challenge", m.id)
                    }
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-overlay"
                  >
                    Challenge {m.displayName ?? m.username}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Start a game"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground outline-none transition hover:bg-surface-overlay hover:text-foreground disabled:opacity-50"
      >
        <FaGamepad className="size-5" />
      </button>
    </div>
  );
}
