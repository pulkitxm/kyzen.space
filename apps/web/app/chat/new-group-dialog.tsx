"use client";

import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import { useAtomValue } from "jotai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import { friendsAtom } from "@/lib/chat/atoms";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";

export function NewGroupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const friends = useAtomValue(friendsAtom);
  const { socket } = useSocket();
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || selected.size === 0) return;
    setCreating(true);
    try {
      await emitAck<{ conversation: { id: string } }>(
        socket,
        CHAT_EVENTS.createGroup,
        { name: trimmed, memberIds: [...selected] },
      );
      onClose();
      router.push(`/chat/group/${encodeURIComponent(trimmed)}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
        <h2 className="mb-3 font-semibold text-lg">New group</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          aria-label="Group name"
          className="mb-3 w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mb-3 max-h-64 overflow-y-auto rounded-xl border border-border">
          {friends.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No friends yet.{" "}
              <Link
                href="/friends"
                onClick={onClose}
                className="text-primary hover:underline"
              >
                Add friends
              </Link>{" "}
              to create a group.
            </div>
          ) : (
            friends.map((f) => {
              const checked = selected.has(f.user.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.user.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-overlay"
                >
                  <PresenceAvatar
                    config={f.user.avatar}
                    seed={f.user.username}
                    size={32}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {f.user.displayName ?? f.user.username}
                  </span>
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border text-[10px]",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {checked ? "✓" : ""}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={create}
              loading={creating}
              disabled={!name.trim() || selected.size === 0}
            >
              Create
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
