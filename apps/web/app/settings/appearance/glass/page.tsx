import type { Metadata } from "next";
import { AppearanceShell } from "@/app/settings/appearance-shell";
import { GlassPicker } from "@/app/settings/glass-picker";
import { getAccountSessions } from "@/lib/get-account-sessions";

export const metadata: Metadata = {
  title: "Glass · Settings · Kyzen",
};

export const dynamic = "force-dynamic";

export default async function GlassSettingsPage() {
  const { current } = await getAccountSessions();
  const signedIn = Boolean(current?.session && current.user);

  return (
    <AppearanceShell signedIn={signedIn}>
      <GlassPicker />
    </AppearanceShell>
  );
}
