"use client";

import { CHAT_EVENTS } from "@kyzen/shared/constants";
import type { ConversationJson } from "@kyzen/shared/types";
import { useAtomValue, useStore } from "jotai";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassPane } from "@/components/glass/glass-pane";
import { Button } from "@/components/ui";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import { ProfilePopupTrigger } from "@/components/ui/profile-popup";
import { conversationsAtom, friendsAtom, presenceAtom } from "@/lib/chat/atoms";
import { presenceLabel } from "@/lib/chat/presence";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

export function GroupSettingsDialog({
  conversation,
  userId,
  open,
  onClose,
}: {
  conversation: ConversationJson;
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const friends = useAtomValue(friendsAtom);
  const presence = useAtomValue(presenceAtom);
  const store = useStore();
  const { socket } = useSocket();
  const router = useRouter();
  const [name, setName] = useState(conversation.name ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  if (!open) return null;

  const isOwner =
    conversation.members.find((m) => m.id === userId)?.role === "owner";
  const memberIds = new Set(conversation.members.map((m) => m.id));
  const addable = friends.filter((f) => !memberIds.has(f.user.id));

  const rename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === conversation.name) return;
    setBusy(true);
    try {
      await emitAck(socket, CHAT_EVENTS.renameGroup, {
        conversationId: conversation.id,
        name: trimmed,
      });
    } catch {
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (uid: string) => {
    try {
      await emitAck(socket, CHAT_EVENTS.addMembers, {
        conversationId: conversation.id,
        userIds: [uid],
      });
    } catch {}
  };

  const removeMember = async (uid: string) => {
    try {
      await emitAck(socket, CHAT_EVENTS.removeMember, {
        conversationId: conversation.id,
        userId: uid,
      });
    } catch {}
  };

  const leave = async () => {
    try {
      await emitAck(socket, CHAT_EVENTS.removeMember, {
        conversationId: conversation.id,
        userId,
      });
      store.set(conversationsAtom, (prev) =>
        prev.filter((c) => c.id !== conversation.id),
      );
      onClose();
      router.push("/chat");
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="glass-scrim absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <GlassPane className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-4 shadow-xl">
        <h2 className="mb-3 font-semibold text-lg">Group settings</h2>

        {isOwner ? (
          <div className="mb-4 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Group name"
              className="flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              size="sm"
              onClick={rename}
              loading={busy}
              disabled={!name.trim() || name.trim() === conversation.name}
            >
              Rename
            </Button>
          </div>
        ) : (
          <div className="mb-4 font-medium text-sm">{conversation.name}</div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Members ({conversation.members.length})
          </div>
          <ul className="mb-4 flex flex-col gap-1">
            {conversation.members.map((m) => {
              const p =
                m.id === userId
                  ? { online: true, lastSeen: null }
                  : presence.get(m.id);
              return (
                <li key={m.id} className="flex items-center gap-3 px-1 py-1.5">
                  {m.id === userId ? (
                    <PresenceAvatar
                      config={m.avatar}
                      seed={m.username}
                      size={32}
                      online={p?.online ? true : undefined}
                    />
                  ) : (
                    <ProfilePopupTrigger user={m} className="shrink-0">
                      <PresenceAvatar
                        config={m.avatar}
                        seed={m.username}
                        size={32}
                        online={p?.online ? true : undefined}
                      />
                    </ProfilePopupTrigger>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {m.displayName ?? m.username}
                      {m.id === userId ? " (you)" : ""}
                    </div>
                    <div
                      className={
                        p?.online
                          ? "min-h-4 truncate text-emerald-500 text-xs"
                          : "min-h-4 truncate text-muted-foreground text-xs"
                      }
                    >
                      {presenceLabel(p)}
                    </div>
                  </div>
                  {m.role === "owner" ? (
                    <span className="text-muted-foreground text-xs">Owner</span>
                  ) : isOwner ? (
                    confirmRemoveId === m.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-xs">
                          Remove?
                        </span>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            removeMember(m.id);
                            setConfirmRemoveId(null);
                          }}
                        >
                          Yes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemoveId(m.id)}
                      >
                        Remove
                      </Button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>

          {isOwner && addable.length > 0 ? (
            <>
              <div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Add friends
              </div>
              <ul className="flex flex-col gap-1">
                {addable.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 px-1 py-1.5"
                  >
                    <PresenceAvatar
                      config={f.user.avatar}
                      seed={f.user.username}
                      size={32}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {f.user.displayName ?? f.user.username}
                    </span>
                    <Button size="sm" onClick={() => addMember(f.user.id)}>
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between border-border border-t pt-3">
          <Button size="sm" variant="danger" onClick={leave}>
            Leave group
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </GlassPane>
    </div>
  );
}
