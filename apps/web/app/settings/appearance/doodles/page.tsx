import type { Metadata } from "next";
import { AppearanceShell } from "@/app/settings/appearance-shell";
import { DoodlePicker } from "@/app/settings/doodle-picker";
import { getAccountSessions } from "@/lib/get-account-sessions";

export const metadata: Metadata = {
  title: "Doodles · Settings · GameLobby",
};

export const dynamic = "force-dynamic";

export default async function DoodleSettingsPage() {
  const { current } = await getAccountSessions();
  const signedIn = Boolean(current?.session && current.user);

  return (
    <AppearanceShell signedIn={signedIn}>
      <DoodlePicker signedIn={signedIn} />
    </AppearanceShell>
  );
}
