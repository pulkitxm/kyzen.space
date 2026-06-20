import type { Metadata } from "next";
import { AppearanceShell } from "@/app/settings/appearance-shell";
import { ThemePicker } from "@/app/settings/theme-picker";
import { getAccountSessions } from "@/lib/get-account-sessions";

export const metadata: Metadata = {
  title: "Theme · Settings · Kyzen",
};

export const dynamic = "force-dynamic";

export default async function ThemeSettingsPage() {
  const { current } = await getAccountSessions();
  const signedIn = Boolean(current?.session && current.user);

  return (
    <AppearanceShell signedIn={signedIn}>
      <ThemePicker signedIn={signedIn} />
    </AppearanceShell>
  );
}
