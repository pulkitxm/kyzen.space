import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SettingsTabs } from "@/app/settings/settings-tabs";

export const metadata: Metadata = {
  title: "Settings · GameLobby",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Manage your account and personalize how GameLobby looks.
        </p>
      </header>

      <SettingsTabs />

      <div className="mt-6">{children}</div>
    </div>
  );
}
