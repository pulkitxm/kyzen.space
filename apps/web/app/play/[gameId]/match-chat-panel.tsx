"use client";

import type {
  AvatarConfig,
  GameJson,
  GamePlayerDto,
  MatchMessage,
} from "@kyzen/shared/types";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
  chatPeers,
  type FriendState,
  friendStates,
  type MatchChatSnapshot,
  mergeMatchMessages,
} from "@/lib/games/match-chat";
import { findMatchHref } from "@/lib/games/queues";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";

type ViewProfile = (user: {
  username: string;
  avatar?: AvatarConfig | null;
}) => void;

type ReportError = (message: string | null) => void;

function failureMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback;
}

function useMatchChat(gameId: string, open: boolean, loadable: boolean) {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [friends, setFriends] = useState<Record<string, FriendState>>({});
  const [error, setError] = useState<string | null>(null);

  const addMessage = (message: MatchMessage) =>
    setMessages((previous) => mergeMatchMessages(previous, [message]));
  const setFriend = (playerId: string, state: FriendState) =>
    setFriends((previous) => ({ ...previous, [playerId]: state }));

  useSocketEvent<MatchMessage>("match:message", (message) => {
    if (message.gameId === gameId && open) addMessage(message);
  });
  useSocketEvent<{
    gameId: string;
    playerId: string | null;
    peerUsername: string | null;
  }>("match:friends", (event) => {
    if (event.gameId !== gameId || !event.playerId) return;
    setFriend(event.playerId, {
      chosen: true,
      mutual: true,
      peerUsername: event.peerUsername,
    });
  });

  useEffect(() => {
    if (!loadable) return;
    let mounted = true;
    const load = async () => {
      try {
        const result = await clientFetchJson<MatchChatSnapshot>(
          `/api/matches/${gameId}/messages`,
        );
        if (!mounted) return;
        setMessages((previous) =>
          mergeMatchMessages(previous, result.messages),
        );
        setFriends(friendStates(result));
        setError(null);
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
  }, [socket, gameId, loadable]);

  return { messages, friends, error, setError, addMessage, setFriend };
}

export function MatchChatPanel({
  game,
  userId,
  onViewProfile,
}: {
  game: GameJson;
  userId: string;
  onViewProfile?: ViewProfile;
}) {
  const publicMatch = Boolean(game.publicMatch);
  const waiting = game.status === "waiting";
  const open = game.status === "active" || (waiting && !publicMatch);
  const chat = useMatchChat(game.id, open, !(waiting && publicMatch));
  const peers = chatPeers(game, userId);

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      aria-label="Match chat"
    >
      <MatchChatHeader
        gameId={game.id}
        peers={peers}
        publicMatch={publicMatch}
        friends={chat.friends}
        onFriend={chat.setFriend}
        onError={chat.setError}
      />
      {open ? (
        <OpenChat
          game={game}
          userId={userId}
          hasPeers={peers.length > 0}
          messages={chat.messages}
          onSent={chat.addMessage}
          onError={chat.setError}
          onViewProfile={onViewProfile}
        />
      ) : (
        <ClosedChat game={game} />
      )}
      <MatchChatFooter publicMatch={publicMatch} error={chat.error} />
    </aside>
  );
}

function MatchChatHeader({
  gameId,
  peers,
  publicMatch,
  friends,
  onFriend,
  onError,
}: {
  gameId: string;
  peers: GamePlayerDto[];
  publicMatch: boolean;
  friends: Record<string, FriendState>;
  onFriend: (playerId: string, state: FriendState) => void;
  onError: ReportError;
}) {
  const { socket } = useSocket();
  const friendListId = useId();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [befriending, setBefriending] = useState(false);
  const soloPeer = publicMatch && peers.length === 1 ? peers[0] : undefined;
  const several = publicMatch && peers.length > 1;

  const befriend = async (playerId: string) => {
    if (!socket?.connected || befriending) return;
    setBefriending(true);
    try {
      const result = await emitAck<{
        ok: true;
        mutual: boolean;
        peerUsername: string | null;
      }>(socket, "match:friend", { gameId, playerId });
      onFriend(playerId, {
        chosen: true,
        mutual: result.mutual,
        peerUsername: result.peerUsername,
      });
      onError(null);
    } catch (failure) {
      onError(failureMessage(failure, "Connection failed"));
    } finally {
      setBefriending(false);
    }
  };

  const friendAction = (player: GamePlayerDto) => (
    <FriendAction
      player={player}
      state={friends[player.userId]}
      disabled={befriending || !socket?.connected}
      onAdd={() => void befriend(player.userId)}
    />
  );

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-border border-b py-3 pr-16 pl-4 md:pr-24">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-primary">
          <FaRegComments size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm">Match chat</h2>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {peers.map((player) => player.username).join(", ") ||
              "No other players"}
          </p>
        </div>
        {soloPeer ? friendAction(soloPeer) : null}
        {several ? (
          <Button
            onClick={() => setFriendsOpen((value) => !value)}
            variant="ghost"
            size="sm"
            aria-expanded={friendsOpen}
            aria-controls={friendListId}
            aria-label="Add friends"
            title="Add friends"
            className="size-8 shrink-0 p-0"
          >
            <FaUserPlus size={14} aria-hidden="true" />
          </Button>
        ) : null}
      </header>
      {several && friendsOpen ? (
        <ul
          id={friendListId}
          aria-label="Players in this match"
          className="max-h-40 shrink-0 space-y-1 overflow-y-auto border-border border-b px-4 py-2"
        >
          {peers.map((player) => (
            <li key={player.userId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {player.username}
              </span>
              {friendAction(player)}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function OpenChat({
  game,
  userId,
  hasPeers,
  messages,
  onSent,
  onError,
  onViewProfile,
}: {
  game: GameJson;
  userId: string;
  hasPeers: boolean;
  messages: MatchMessage[];
  onSent: (message: MatchMessage) => void;
  onError: ReportError;
  onViewProfile?: ViewProfile;
}) {
  if (!hasPeers)
    return (
      <div className="min-h-0 flex-1 px-4 py-5">
        <ChatNotice
          title="No one to chat with"
          detail={
            game.status === "waiting"
              ? "Chat opens when another player joins this room."
              : "Only bots are in this match, so there is no one to message."
          }
        />
      </div>
    );
  return (
    <>
      <MessageLog
        messages={messages}
        players={game.players}
        userId={userId}
        onViewProfile={onViewProfile}
      />
      <MatchComposer gameId={game.id} onSent={onSent} onError={onError} />
    </>
  );
}

function ClosedChat({ game }: { game: GameJson }) {
  if (game.status === "waiting")
    return (
      <div className="min-h-0 flex-1 px-4 py-5">
        <ChatNotice
          title="Chat opens soon"
          detail="Match chat opens when the game starts."
        />
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-muted-foreground text-sm">Match ended</p>
      {game.publicMatch ? (
        <Link
          href={findMatchHref(game)}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-5 font-medium text-primary-foreground text-sm transition hover:bg-primary-hover"
        >
          Play again
        </Link>
      ) : null}
    </div>
  );
}

function MessageLog({
  messages,
  players,
  userId,
  onViewProfile,
}: {
  messages: MatchMessage[];
  players: GamePlayerDto[];
  userId: string;
  onViewProfile?: ViewProfile;
}) {
  const messageEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length)
      messageEnd.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [messages.length]);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
      role="log"
      aria-label="Match messages"
      aria-live="polite"
    >
      {messages.length ? (
        <div className="space-y-4">
          {messages.map((message) => (
            <MatchMessageItem
              key={message.id}
              message={message}
              mine={message.authorId === userId}
              author={players.find(
                (player) => player.userId === message.authorId,
              )}
              onViewProfile={onViewProfile}
            />
          ))}
          <div ref={messageEnd} />
        </div>
      ) : (
        <ChatNotice
          title="Say hello"
          detail="Message the players in this match."
        />
      )}
    </div>
  );
}

function MatchComposer({
  gameId,
  onSent,
  onError,
}: {
  gameId: string;
  onSent: (message: MatchMessage) => void;
  onError: ReportError;
}) {
  const { socket } = useSocket();
  const [body, setBody] = useState("");
  const sending = useRef(false);
  const pendingClientId = useRef<string | null>(null);

  const send = async () => {
    const text = body.trim();
    if (!socket?.connected || !text || sending.current) return;
    sending.current = true;
    pendingClientId.current ??= crypto.randomUUID();
    try {
      const result = await emitAck<{ ok: true; message?: MatchMessage }>(
        socket,
        "match:message",
        { gameId, clientId: pendingClientId.current, body: text },
      );
      pendingClientId.current = null;
      if (result.message) onSent(result.message);
      setBody((current) => (current.trim() === text ? "" : current));
      onError(null);
    } catch (failure) {
      onError(failureMessage(failure, "Message failed"));
    } finally {
      sending.current = false;
    }
  };

  return (
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
          disabled={!body.trim() || !socket?.connected}
          aria-label="Send"
          className="size-8 shrink-0 p-0"
        >
          <FaPaperPlane size={12} aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

function MatchChatFooter({
  publicMatch,
  error,
}: {
  publicMatch: boolean;
  error: string | null;
}) {
  return (
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
          Chat disappears when the match ends. Messages are kept for safety for
          7 days, then deleted.
          {publicMatch
            ? " Profiles are shared only when both players add each other."
            : null}
        </p>
      </details>
      {error ? (
        <p role="alert" className="mt-2 text-center text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FriendAction({
  player,
  state,
  disabled,
  onAdd,
}: {
  player: GamePlayerDto;
  state: FriendState | undefined;
  disabled: boolean;
  onAdd: () => void;
}) {
  if (state?.mutual) {
    const label = `Message ${player.username}`;
    return (
      <Link
        href={
          state.peerUsername
            ? `/chat/${encodeURIComponent(state.peerUsername)}`
            : "/chat"
        }
        aria-label={label}
        title={label}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface hover:text-foreground"
      >
        <FaRegComments size={14} aria-hidden="true" />
      </Link>
    );
  }
  const label = state?.chosen
    ? `Friend request sent to ${player.username}`
    : `Add ${player.username} as a friend`;
  return (
    <Button
      onClick={onAdd}
      variant="ghost"
      size="sm"
      disabled={disabled || Boolean(state?.chosen)}
      aria-label={label}
      title={label}
      className="size-8 shrink-0 p-0"
    >
      {state?.chosen ? (
        <FaCheck size={14} aria-hidden="true" />
      ) : (
        <FaUserPlus size={14} aria-hidden="true" />
      )}
    </Button>
  );
}

function MatchMessageItem({
  message,
  mine,
  author,
  onViewProfile,
}: {
  message: MatchMessage;
  mine: boolean;
  author: GamePlayerDto | undefined;
  onViewProfile?: ViewProfile;
}) {
  const name = mine ? "You" : (author?.username ?? "Player");
  return (
    <div
      className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
    >
      {!mine && author && onViewProfile ? (
        <button
          type="button"
          onClick={() =>
            onViewProfile({ username: author.username, avatar: author.avatar })
          }
          className="rounded px-1 text-[10px] text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {name}
        </button>
      ) : (
        <span className="px-1 text-[10px] text-muted-foreground">{name}</span>
      )}
      <p
        className={`wrap-break-word max-w-[90%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-card-foreground"}`}
      >
        {message.body}
      </p>
    </div>
  );
}

function ChatNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border bg-surface">
        <FaRegComments
          className="text-muted-foreground"
          size={20}
          aria-hidden="true"
        />
      </div>
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-1 max-w-52 text-muted-foreground text-xs leading-relaxed">
        {detail}
      </p>
    </div>
  );
}
