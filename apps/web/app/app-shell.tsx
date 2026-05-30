"use client";

import type { AvatarConfig } from "@gamelobby/avatar";
import { Provider } from "jotai";
import { useCallback, useState } from "react";
import { FaChevronRight } from "react-icons/fa";

import { ChatSocketBridge } from "@/app/chat-socket-bridge";
import { Sidebar } from "@/app/sidebar";
import { TooltipProvider } from "@/app/ui/tooltip";
import type { SidebarPrefs } from "@/lib/sidebar-prefs";
import { SocketProvider } from "@/lib/socket/socket-context";

export function AppShellClient({
  children,
  username,
  avatar,
  userId,
  signedIn,
  profileHref,
  sidebarPrefsTrusted,
  sidebarPrefs,
}: {
  children: React.ReactNode;
  username: string | null;
  avatar: AvatarConfig | null;
  userId: string | null;
  signedIn: boolean;
  profileHref: string;
  sidebarPrefsTrusted: boolean;
  sidebarPrefs: SidebarPrefs;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <TooltipProvider delayDuration={300}>
      <Provider>
        <SocketProvider enabled={signedIn}>
          {signedIn && userId ? <ChatSocketBridge userId={userId} /> : null}
          <div className="flex h-screen overflow-hidden bg-background">
            {mobileOpen && (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={closeMobile}
                aria-label="Close menu"
              />
            )}

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
              sidebarPrefsTrusted={sidebarPrefsTrusted}
              sidebarPrefs={sidebarPrefs}
              mobileOpen={mobileOpen}
              onCloseMobile={closeMobile}
              username={username}
              avatar={avatar}
              signedIn={signedIn}
              profileHref={profileHref}
            />

            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
              {children}
            </main>
          </div>
        </SocketProvider>
      </Provider>
    </TooltipProvider>
  );
}
