"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";

export function SessionEndForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onEnd = () =>
    startTransition(async () => {
      const res = await clientFetch("/api/account/revoke-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        signedOut?: boolean;
      };
      if (data.signedOut) router.push("/auth");
      else router.refresh();
    });

  return (
    <Button variant="danger" size="sm" loading={pending} onClick={onEnd}>
      {pending ? "Ending…" : "End session"}
    </Button>
  );
}
