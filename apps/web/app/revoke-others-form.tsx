"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";

export function RevokeOthersForm({
  otherSessionCount,
}: {
  otherSessionCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (otherSessionCount === 0) return null;

  const onRevoke = async () => {
    setPending(true);
    try {
      await clientFetch("/api/account/revoke-others", { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-6">
      <Button variant="danger" loading={pending} onClick={onRevoke}>
        Sign out all other sessions
      </Button>
      <p className="mt-2 max-w-xl text-muted-foreground text-xs">
        Ends {otherSessionCount} other active session
        {otherSessionCount === 1 ? "" : "s"}. This device stays signed in.
      </p>
    </div>
  );
}
