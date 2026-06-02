"use client";

import { useState } from "react";
import { FaPalette, FaShapes } from "react-icons/fa";

import { DoodlePicker } from "@/app/settings/doodle-picker";
import { ThemePicker } from "@/app/settings/theme-picker";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "theme", label: "Theme", Icon: FaPalette },
  { id: "doodles", label: "Doodles", Icon: FaShapes },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AppearanceTabs({ signedIn }: { signedIn: boolean }) {
  const [tab, setTab] = useState<TabId>("theme");

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Appearance settings"
        className="inline-flex w-fit rounded-xl border border-border bg-surface p-1"
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-1.5 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "theme" ? (
        <ThemePicker signedIn={signedIn} />
      ) : (
        <DoodlePicker signedIn={signedIn} />
      )}
    </div>
  );
}
