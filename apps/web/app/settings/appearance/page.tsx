import type { Metadata } from "next";
import { AppearanceTabs } from "@/app/settings/appearance-tabs";
import { getAccountSessions } from "@/lib/get-account-sessions";

export const metadata: Metadata = {
  title: "Appearance · Settings · GameLobby",
};

export const dynamic = "force-dynamic";

export default async function AppearanceSettingsPage() {
  const { current } = await getAccountSessions();
  const signedIn = Boolean(current?.session && current.user);

  return (
    <section
      aria-labelledby="appearance-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4">
        <h2
          id="appearance-heading"
          className="font-medium text-foreground text-lg"
        >
          Appearance
        </h2>
        <p className="mt-0.5 text-muted-foreground text-sm">
          Switch between Theme and Doodles. Hover an option to preview it live
          and click to apply.
          {signedIn
            ? " Your choices are saved to your account."
            : " Sign in to save your choices across devices."}
        </p>
      </div>

      <AppearanceTabs signedIn={signedIn} />
    </section>
  );
}
