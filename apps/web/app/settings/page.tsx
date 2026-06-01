import type { Metadata } from "next";

import { AppearanceTabs } from "@/app/settings/appearance-tabs";
import { getServerSession } from "@/lib/get-server-session";

export const metadata: Metadata = {
  title: "Settings · GameLobby",
};

export default async function SettingsPage() {
  const session = await getServerSession();
  const signedIn = Boolean(session?.user);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Personalize how GameLobby looks.
        </p>
      </header>

      <section
        aria-labelledby="theme-heading"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="mb-4">
          <h2
            id="theme-heading"
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
    </div>
  );
}
