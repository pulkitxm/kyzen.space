"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";

export function SignOutForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSignOut = async () => {
    setPending(true);
    try {
      await clientFetch("/api/account/sign-out", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={onSignOut}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
