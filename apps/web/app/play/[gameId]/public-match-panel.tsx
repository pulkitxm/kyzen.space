"use client";

import type { GameJson, MatchMessage } from "@kyzen/shared/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clientFetchJson } from "@/lib/api-client";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";

function mergeMessages(previous: MatchMessage[], incoming: MatchMessage[]) {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()]
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .slice(-100);
}

export function PublicMatchPanel({
  game,
  userId,
}: {
  game: GameJson;
  userId: string;
}) {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [body, setBody] = useState("");
  const [social, setSocial] = useState({ chosen: false, mutual: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = game.status === "active";

  useSocketEvent<MatchMessage>("match:message", (message) => {
    if (message.gameId === game.id && active)
      setMessages((previous) => mergeMessages(previous, [message]));
  });
  useSocketEvent<{ gameId: string }>("match:friends", (event) => {
    if (event.gameId === game.id) setSocial({ chosen: true, mutual: true });
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const result = await clientFetchJson<{
          messages: MatchMessage[];
          chosen: boolean;
          mutual: boolean;
        }>(`/api/matches/${game.id}/messages`);
        if (mounted) {
          setMessages((previous) => mergeMessages(previous, result.messages));
          setSocial({ chosen: result.chosen, mutual: result.mutual });
          setError(null);
        }
      } catch {
        if (mounted)
          setError("Match chat could not be loaded. Reconnect to retry.");
      }
    };
    void load();
    socket?.on("connect", load);
    return () => {
      mounted = false;
      socket?.off("connect", load);
    };
  }, [socket, game.id]);

  const send = async () => {
    if (!socket?.connected || !body.trim() || busy) return;
    setBusy(true);
    try {
      await emitAck(socket, "match:message", {
        gameId: game.id,
        clientId: crypto.randomUUID(),
        body: body.trim(),
      });
      setBody("");
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Message failed");
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    if (!socket?.connected || busy) return;
    setBusy(true);
    try {
      const result = await emitAck<{ ok: true; mutual: boolean }>(
        socket,
        "match:friend",
        { gameId: game.id },
      );
      setSocial({ chosen: true, mutual: result.mutual });
      setError(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Connection failed",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="flex max-h-80 min-h-0 flex-col gap-3 border-border border-t bg-surface-raised p-4 md:max-h-none md:border-t-0 md:border-l"
      aria-label="Public match chat"
    >
      <div>
        <h2 className="font-semibold text-card-foreground">Anonymous match</h2>
        <p className="text-muted-foreground text-xs">
          Profiles stay hidden. Chat disappears when the match ends. Messages
          are retained for safety for 7 days.
        </p>
      </div>
      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto"
        role="log"
        aria-label="Match messages"
        aria-live="polite"
      >
        {active ? (
          messages.map((message) => (
            <p
              key={message.id}
              className="wrap-break-word rounded-lg bg-surface-overlay p-2 text-sm"
            >
              <span className="font-semibold">
                {message.authorId === userId
                  ? "You"
                  : (game.players.find(
                      (player) => player.userId === message.authorId,
                    )?.username ?? "Opponent")}
                :{" "}
              </span>
              {message.body}
            </p>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">Match chat has ended.</p>
        )}
      </div>
      {active ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            aria-label="Match message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={1000}
            placeholder="Say hello"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background p-2 text-sm"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-lg bg-primary px-3 text-primary-foreground text-sm disabled:opacity-50"
          >
            Send
          </button>
        </form>
      ) : null}
      {social.mutual ? (
        <Link href="/chat" className="font-medium text-primary text-sm">
          You are friends. Open permanent chats
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy || social.chosen}
          className="rounded-lg border border-border p-2 text-card-foreground text-sm disabled:opacity-50"
        >
          {social.chosen ? "Waiting for opponent to connect" : "Add friend"}
        </button>
      )}
      <p className="text-muted-foreground text-xs">
        Both players must add each other. This shares your profiles and opens a
        new permanent chat.
      </p>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
