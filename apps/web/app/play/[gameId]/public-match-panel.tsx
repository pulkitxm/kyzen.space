"use client";

import type { GameJson, MatchMessage } from "@kyzen/shared/types";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  FaCheck,
  FaCircleInfo,
  FaLock,
  FaPaperPlane,
  FaRegComments,
  FaUserPlus,
} from "react-icons/fa6";
import { Button } from "@/components/ui";
import { clientFetchJson } from "@/lib/api-client";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";

type MatchPeer = { playerId: string; username: string };

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
  const [social, setSocial] = useState({
    chosen: false,
    mutual: false,
    peerUsername: null as string | null,
    peers: [] as MatchPeer[],
  });
  const messageEnd = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const pendingClientId = useRef<string | null>(null);
  const active = game.status === "active";

  useSocketEvent<MatchMessage>("match:message", (message) => {
    if (message.gameId === game.id && active)
      setMessages((previous) => mergeMessages(previous, [message]));
  });
  useSocketEvent<{
    gameId: string;
    peerUsername: string | null;
    peers?: MatchPeer[];
  }>("match:friends", (event) => {
    if (event.gameId === game.id)
      setSocial({
        chosen: true,
        mutual: true,
        peerUsername: event.peerUsername,
        peers: event.peers ?? [],
      });
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const result = await clientFetchJson<{
          messages: MatchMessage[];
          chosen: boolean;
          mutual: boolean;
          peerUsername: string | null;
          peers?: MatchPeer[];
        }>(`/api/matches/${game.id}/messages`);
        if (mounted) {
          setMessages((previous) => mergeMessages(previous, result.messages));
          setSocial({
            chosen: result.chosen,
            mutual: result.mutual,
            peerUsername: result.peerUsername,
            peers: result.peers ?? [],
          });
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
    if (!socket?.connected || !body.trim() || sending.current) return;
    sending.current = true;
    setBusy(true);
    const clientId = pendingClientId.current ?? crypto.randomUUID();
    pendingClientId.current = clientId;
    try {
      const result = await emitAck<{ ok: true; message: MatchMessage }>(
        socket,
        "match:message",
        { gameId: game.id, clientId, body: body.trim() },
      );
      pendingClientId.current = null;
      setMessages((previous) => mergeMessages(previous, [result.message]));
      setBody("");
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Message failed");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const connect = async () => {
    if (!socket?.connected || busy) return;
    setBusy(true);
    try {
      const result = await emitAck<{
        ok: true;
        mutual: boolean;
        peerUsername: string | null;
        peers?: MatchPeer[];
      }>(socket, "match:friend", { gameId: game.id });
      setSocial({
        chosen: true,
        mutual: result.mutual,
        peerUsername: result.peerUsername,
        peers: result.peers ?? [],
      });
      setError(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Connection failed",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (messages.length)
      messageEnd.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [messages.length]);

  const opponent = game.players.find((player) => player.userId !== userId);
  const chatHref = social.peerUsername
    ? `/chat/${encodeURIComponent(social.peerUsername)}`
    : "/chat";

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      aria-label={game.publicMatch ? "Public match chat" : "Room chat"}
    >
      <header className="flex shrink-0 items-center gap-3 border-border border-b py-3 pr-16 pl-4 md:pr-24">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-primary">
          <FaRegComments size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm">Match chat</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
            {game.players.length > 2
              ? "All four players"
              : (opponent?.username ?? "Opponent")}
          </p>
        </div>
        {!game.publicMatch ? null : social.mutual ? (
          <Link
            href={chatHref}
            aria-label="Message friend"
            title="Message friend"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            <FaRegComments size={14} aria-hidden="true" />
          </Link>
        ) : (
          <Button
            onClick={() => void connect()}
            variant="ghost"
            size="sm"
            disabled={busy || social.chosen || !socket?.connected}
            aria-label={social.chosen ? "Friend request sent" : "Add friend"}
            title={
              social.chosen
                ? "Connection enabled"
                : "Connect with players who also opt in"
            }
            className="size-8 shrink-0 p-0"
          >
            {social.chosen ? (
              <FaCheck size={14} aria-hidden="true" />
            ) : (
              <FaUserPlus size={14} aria-hidden="true" />
            )}
          </Button>
        )}
      </header>
      {game.publicMatch && game.players.length > 2 ? (
        <div className="space-y-2 border-border border-b px-4 py-3 text-xs">
          <p className="text-muted-foreground">
            Connect shares your profile and adds every player who also chooses
            Connect as a friend.
          </p>
          {social.peers.map((peer) => (
            <Link
              key={peer.playerId}
              className="block text-primary"
              href={`/chat/${encodeURIComponent(peer.username)}`}
            >
              Message {peer.username}
            </Link>
          ))}
        </div>
      ) : null}
      {active ? (
        <>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
            role="log"
            aria-label="Match messages"
            aria-live="polite"
          >
            {messages.length ? (
              <div className="space-y-4">
                {messages.map((message) => {
                  const mine = message.authorId === userId;
                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
                    >
                      <span className="px-1 text-[10px] text-muted-foreground">
                        {mine
                          ? "You"
                          : (game.players.find(
                              (player) => player.userId === message.authorId,
                            )?.username ?? "Player")}
                      </span>
                      <p
                        className={`wrap-break-word max-w-[90%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-card-foreground"}`}
                      >
                        {message.body}
                      </p>
                    </div>
                  );
                })}
                <div ref={messageEnd} />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border bg-surface">
                  <FaRegComments
                    className="text-muted-foreground"
                    size={20}
                    aria-hidden="true"
                  />
                </div>
                <p className="font-medium text-sm">Say hello</p>
                <p className="mt-1 max-w-52 text-muted-foreground text-xs leading-relaxed">
                  Chat with the other players while you play.
                </p>
              </div>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="shrink-0 border-border border-t px-3 pt-3 pb-2"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
              <input
                aria-label="Match message"
                value={body}
                onChange={(event) => {
                  pendingClientId.current = null;
                  setBody(event.target.value);
                }}
                maxLength={1000}
                placeholder="Send a message..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                size="sm"
                disabled={busy || !body.trim() || !socket?.connected}
                aria-label="Send"
                className="size-8 shrink-0 p-0"
              >
                <FaPaperPlane size={12} aria-hidden="true" />
              </Button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-muted-foreground text-sm">Match ended</p>
          <Link
            href={
              game.publicMatch
                ? `/play/find/${game.gameType}`
                : `/play/new/${game.gameType}`
            }
            className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-5 font-medium text-primary-foreground text-sm transition hover:bg-primary-hover"
          >
            Play again
          </Link>
        </div>
      )}
      <div className="shrink-0 px-4 py-2">
        <details className="text-[10px] text-muted-foreground leading-relaxed">
          <summary
            className="flex cursor-pointer list-none items-center gap-1.5"
            aria-label="Match chat privacy"
          >
            <FaCircleInfo size={10} aria-hidden="true" />
            Match chat
            <FaLock size={8} aria-hidden="true" />
          </summary>
          <p className="mt-2">
            Chat disappears when the match ends. Messages are kept for safety
            for 7 days, then deleted.{" "}
            {game.publicMatch
              ? "Profiles are shared only between players who both choose Connect."
              : "Only seated players can use this room chat."}
          </p>
        </details>
        {error ? (
          <p role="alert" className="mt-2 text-center text-danger text-xs">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
