"use client";

import { useCallback, useState } from "react";
import { FaChevronRight } from "react-icons/fa";

import { Sidebar } from "@/app/sidebar";
import { TooltipProvider } from "@/app/ui/tooltip";

export function AppShellClient({
  children,
  username,
  signedIn,
  profileHref,
}: {
  children: React.ReactNode;
  username: string | null;
  signedIn: boolean;
  profileHref: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Mobile overlay */}
        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={closeMobile}
            aria-label="Close menu"
          />
        )}

        {/* Mobile open button */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed top-4 left-4 z-30 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground shadow md:hidden"
          aria-label="Open menu"
          style={{ display: mobileOpen ? "none" : undefined }}
        >
          <FaChevronRight className="h-4 w-4" />
        </button>

        <Sidebar
          mobileOpen={mobileOpen}
          onCloseMobile={closeMobile}
          username={username}
          signedIn={signedIn}
          profileHref={profileHref}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
