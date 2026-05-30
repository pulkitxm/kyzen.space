"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConversationPicker } from "@/app/games/components/conversation-picker";

export function PlayButton({ userId }: { userId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => (userId ? setOpen(true) : router.push("/auth"))}
        className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm shadow outline-none transition hover:opacity-90"
      >
        Play with a friend
      </button>
      {open && userId ? (
        <ConversationPicker userId={userId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
