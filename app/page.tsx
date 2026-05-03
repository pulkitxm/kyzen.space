"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";

type ChatPayload = {
  id: string;
  socketId: string;
  text: string;
  at: number;
};

function shortenId(id: string) {
  return id.slice(0, 6);
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");
  const [messages, setMessages] = useState<ChatPayload[]>([]);
  const [draft, setDraft] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    function syncTransportFromEngine() {
      const name = socket.io.engine?.transport?.name;
      setTransport(typeof name === "string" ? name : "N/A");
    }

    function onUpgrade() {
      syncTransportFromEngine();
    }

    function onConnect() {
      setIsConnected(true);
      setMyId(socket.id ?? null);
      syncTransportFromEngine();
      socket.io.engine?.on("upgrade", onUpgrade);
    }

    function onDisconnect() {
      setIsConnected(false);
      setTransport("N/A");
      socket.io.engine?.off("upgrade", onUpgrade);
    }

    function onChatMessage(msg: ChatPayload) {
      if (
        typeof msg?.id === "string" &&
        typeof msg?.socketId === "string" &&
        typeof msg?.text === "string" &&
        typeof msg?.at === "number"
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    }

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:message", onChatMessage);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:message", onChatMessage);
      socket.io.engine?.off("upgrade", onUpgrade);
    };
  }, []);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || !socket.connected) return;
    socket.emit("chat:send", { text });
    setDraft("");
  }, [draft]);

  const connectionLabel = useMemo(
    () => (isConnected ? "Connected" : "Disconnected"),
    [isConnected],
  );

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 md:py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-violet-500/18 blur-[100px]" />
        <div className="absolute -bottom-40 right-[-10%] size-[420px] rounded-full bg-cyan-500/12 blur-[90px]" />
      </div>

      <main className="w-full max-w-md">
        <header className="mb-6 text-center">
          <h1 className="font-semibold tracking-tight text-2xl text-foreground md:text-[1.65rem]">
            Live relay
          </h1>
          <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
            Open this page in two tabs or browsers — messages broadcast to everyone
            on the socket.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-medium font-mono">
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 " +
                (isConnected
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-neutral-400/35 bg-neutral-500/10 text-neutral-600 dark:text-neutral-400")
              }
              aria-live="polite"
            >
              <span
                className={
                  "inline-block size-1.5 rounded-full " +
                  (isConnected ? "bg-emerald-500 brightness-105" : "bg-neutral-400")
                }
              />
              {connectionLabel}
            </span>
            <span className="rounded-full border border-neutral-300/70 bg-neutral-950/[0.03] px-2.5 py-1 text-neutral-700 dark:border-neutral-600/70 dark:bg-white/[0.04] dark:text-neutral-300">
              transport: <span className="text-neutral-900 dark:text-neutral-100">{transport}</span>
            </span>
            {myId ? (
              <span className="rounded-full border border-neutral-300/70 bg-neutral-950/[0.03] px-2.5 py-1 text-neutral-600 dark:border-neutral-600/70 dark:text-neutral-400">
                you · <span className="font-mono text-neutral-800 dark:text-neutral-200">{shortenId(myId)}</span>
              </span>
            ) : null}
          </div>
        </header>

        <section
          className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/55 shadow-xl shadow-neutral-950/5 backdrop-blur-md dark:border-neutral-800/90 dark:bg-neutral-950/45 dark:shadow-neutral-950/40"
          aria-label="Shared messages"
        >
          <div className="max-h-[min(52vh,360px)] min-h-[200px] space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-500">
                {isConnected
                  ? "No messages yet — say hello from another window."
                  : "Connecting… you can type once connected."}
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.socketId === myId;
                return (
                  <article
                    key={m.id}
                    className={
                      "flex max-w-[90%] flex-col gap-0.5 " + (mine ? "ml-auto items-end" : "mr-auto items-start")
                    }
                  >
                    <div
                      className={
                        mine
                          ? "rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2 text-[15px] leading-snug text-white shadow-md shadow-violet-950/20"
                          : "rounded-2xl rounded-bl-md border border-neutral-200/90 bg-neutral-50 px-3.5 py-2 text-[15px] leading-snug text-neutral-900 shadow-sm dark:border-neutral-700/90 dark:bg-neutral-900 dark:text-neutral-100"
                      }
                    >
                      {m.text}
                    </div>
                    <span className="px-1 text-[11px] text-neutral-500 dark:text-neutral-500">
                      {mine ? "You" : shortenId(m.socketId)} ·{" "}
                      {new Date(m.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </article>
                );
              })
            )}
            <div ref={scrollAnchorRef} aria-hidden />
          </div>

          <div className="border-t border-neutral-200/80 p-3 dark:border-neutral-800/90">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  isConnected ? "Broadcast a message…" : "Waiting for socket…"
                }
                disabled={!isConnected}
                maxLength={2000}
                className={
                  "min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 text-sm outline-none transition " +
                  "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 " +
                  "focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 dark:border-neutral-700 " +
                  "dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 " +
                  "disabled:cursor-not-allowed disabled:opacity-55"
                }
                aria-label="Message text"
              />
              <button
                type="submit"
                disabled={!isConnected || draft.trim().length === 0}
                className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-violet-950/25 transition hover:bg-violet-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
