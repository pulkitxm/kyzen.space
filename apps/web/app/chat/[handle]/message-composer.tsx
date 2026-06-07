"use client";

import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type {
  ConversationJson,
  GifJson,
  GifMeta,
  MemberJson,
} from "@gamelobby/shared/types";
import { useStore } from "jotai";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRegFaceSmile } from "react-icons/fa6";
import {
  type ChatMessage,
  messagesAtomFamily,
  upsertMessage,
} from "@/lib/chat/atoms";
import { loadShortcodes } from "@/lib/chat/emoji";
import { replaceShortcodeBeforeSpace } from "@/lib/chat/shortcodes";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { GameLauncher } from "./game-launcher";

const ComposerPicker = dynamic(
  () => import("./composer-picker").then((m) => m.ComposerPicker),
  { ssr: false },
);

const MAX_TEXTAREA_HEIGHT = 160;

export function MessageComposer({
  conversationId,
  conversation,
  me,
}: {
  conversationId: string;
  conversation: ConversationJson;
  me: MemberJson | undefined;
}) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const store = useStore();
  const { socket } = useSocket();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const shortcodesRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    void loadShortcodes().then((m) => {
      shortcodesRef.current = m;
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the intended trigger to recompute the textarea height even though the body reads it via the ref
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const borderY = ta.offsetHeight - ta.clientHeight;
    const full = ta.scrollHeight + borderY;
    ta.style.height = `${Math.min(full, MAX_TEXTAREA_HEIGHT)}px`;
    ta.style.overflowY = full > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [text]);

  const lastTypingRef = useRef(0);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (idleRef.current) {
      clearTimeout(idleRef.current);
      idleRef.current = null;
    }
    lastTypingRef.current = 0;
    socket?.emit(CHAT_EVENTS.typingStop, { conversationId });
  }, [socket, conversationId]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      socket?.emit(CHAT_EVENTS.typingStart, { conversationId });
    }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      idleRef.current = null;
      lastTypingRef.current = 0;
      socket?.emit(CHAT_EVENTS.typingStop, { conversationId });
    }, 3000);
  }, [socket, conversationId]);

  useEffect(() => stopTyping, [stopTyping]);

  const onType = useCallback(
    (value: string, caret: number) => {
      if (shortcodesRef.current && value[caret - 1] === " ") {
        const replaced = replaceShortcodeBeforeSpace(value, caret, (c) =>
          shortcodesRef.current?.get(c),
        );
        if (replaced) {
          setText(replaced.value);
          requestAnimationFrame(() =>
            taRef.current?.setSelectionRange(replaced.caret, replaced.caret),
          );
          emitTyping();
          return;
        }
      }
      setText(value);
      if (value.trim()) emitTyping();
      else stopTyping();
    },
    [emitTyping, stopTyping],
  );

  const insertEmoji = useCallback(
    (native: string) => {
      const ta = taRef.current;
      const start = ta?.selectionStart ?? text.length;
      const end = ta?.selectionEnd ?? start;
      const next = text.slice(0, start) + native + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        ta?.focus();
        const pos = start + native.length;
        ta?.setSelectionRange(pos, pos);
      });
    },
    [text],
  );

  const sendGif = useCallback(
    async (gif: GifJson) => {
      const clientId = crypto.randomUUID();
      const metadata: GifMeta = {
        provider: "klipy",
        providerId: gif.id,
        previewUrl: gif.previewUrl,
        fullUrl: gif.fullUrl,
        width: gif.width,
        height: gif.height,
        title: gif.title,
        blurPreview: gif.blurPreview,
      };
      const optimistic: ChatMessage = {
        id: clientId,
        conversationId,
        sender: me
          ? {
              id: me.id,
              username: me.username,
              displayName: me.displayName,
              avatar: me.avatar,
            }
          : null,
        kind: "gif",
        body: null,
        metadata,
        gameId: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        pending: true,
        clientId,
      };
      store.set(messagesAtomFamily(conversationId), (prev) =>
        upsertMessage(prev, optimistic),
      );
      setPickerOpen(false);
      try {
        await emitAck(socket, CHAT_EVENTS.sendMessage, {
          conversationId,
          clientId,
          kind: "gif",
          metadata,
        });
      } catch {
        store.set(messagesAtomFamily(conversationId), (prev) =>
          prev.map((m) =>
            m.clientId === clientId ? { ...m, pending: false } : m,
          ),
        );
      }
    },
    [conversationId, me, socket, store],
  );

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: clientId,
      conversationId,
      sender: me
        ? {
            id: me.id,
            username: me.username,
            displayName: me.displayName,
            avatar: me.avatar,
          }
        : null,
      kind: "text",
      body,
      metadata: null,
      gameId: null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      pending: true,
      clientId,
    };
    store.set(messagesAtomFamily(conversationId), (prev) =>
      upsertMessage(prev, optimistic),
    );
    setText("");
    stopTyping();
    try {
      await emitAck(socket, CHAT_EVENTS.sendMessage, {
        conversationId,
        clientId,
        kind: "text",
        body,
      });
    } catch {
      store.set(messagesAtomFamily(conversationId), (prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, pending: false } : m,
        ),
      );
    }
  }, [text, conversationId, me, socket, store, stopTyping]);

  return (
    <div className="relative border-border border-t px-4 py-3">
      {pickerOpen ? (
        <button
          type="button"
          aria-label="Close picker"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setPickerOpen(false)}
        />
      ) : null}
      {pickerOpen ? (
        <div className="absolute right-3 bottom-full z-20 mb-2">
          <ComposerPicker onEmoji={insertEmoji} onGif={sendGif} />
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Emoji & GIFs"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-surface-overlay hover:text-foreground"
        >
          <FaRegFaceSmile className="size-5" />
        </button>
        {me ? (
          <GameLauncher conversation={conversation} userId={me.id} />
        ) : null}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) =>
            onType(
              e.target.value,
              e.target.selectionStart ?? e.target.value.length,
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Message…"
          className="max-h-40 min-h-11 flex-1 resize-none overflow-y-hidden rounded-2xl border border-border bg-surface-raised px-4 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim()}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
        >
          <FaPaperPlane className="size-4" />
        </button>
      </div>
    </div>
  );
}
