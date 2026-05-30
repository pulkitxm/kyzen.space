import type { AvatarConfig } from "@gamelobby/avatar";
import type { ConversationJson, FriendshipJson } from "@gamelobby/chat-core";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";

import { AppShellClient } from "@/app/app-shell";
import { Providers } from "@/app/providers";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import {
  parseSidebarPrefsCookieValue,
  SIDEBAR_LS_BOOT_SCRIPT,
  SIDEBAR_PREFS_COOKIE,
} from "@/lib/sidebar-prefs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GameLobby",
  description: "Play live multiplayer games",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  const signedIn = Boolean(session?.user);

  let username: string | null = null;
  let avatar: AvatarConfig | null = null;
  // Seed chat/social state on the server (no client fetch on load); the socket
  // keeps these atoms live afterward.
  let initialConversations: ConversationJson[] = [];
  let initialFriends: FriendshipJson[] = [];
  let initialIncoming: FriendshipJson[] = [];
  let initialOutgoing: FriendshipJson[] = [];
  let initialUnreadNotifications = 0;
  if (session?.user?.id) {
    const [me, convs, fr, reqs, notif] = await Promise.all([
      serverFetchJson<{
        profile: { username: string; avatar: AvatarConfig | null };
      }>("/api/profiles/me"),
      serverFetchJson<{ conversations: ConversationJson[] }>(
        "/api/conversations",
      ),
      serverFetchJson<{ friends: FriendshipJson[] }>("/api/friends"),
      serverFetchJson<{
        incoming: FriendshipJson[];
        outgoing: FriendshipJson[];
      }>("/api/friends/requests"),
      serverFetchJson<{ count: number }>("/api/notifications/unread-count"),
    ]);
    username = me?.profile.username ?? null;
    avatar = me?.profile.avatar ?? null;
    initialConversations = convs?.conversations ?? [];
    initialFriends = fr?.friends ?? [];
    initialIncoming = reqs?.incoming ?? [];
    initialOutgoing = reqs?.outgoing ?? [];
    initialUnreadNotifications = notif?.count ?? 0;
  }

  const profileHref = signedIn
    ? username
      ? `/${username}`
      : "/profile"
    : "/auth";

  const cookieStore = await cookies();
  const prefCookieRaw = cookieStore.get(SIDEBAR_PREFS_COOKIE)?.value;
  const sidebarPrefsTrusted =
    typeof prefCookieRaw === "string" && prefCookieRaw.length > 0;
  const sidebarPrefs = parseSidebarPrefsCookieValue(prefCookieRaw);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Script id="gl-sidebar-cookie-bootstrap" strategy="beforeInteractive">
          {SIDEBAR_LS_BOOT_SCRIPT}
        </Script>
        <Providers>
          <AppShellClient
            username={username}
            avatar={avatar}
            userId={session?.user?.id ?? null}
            signedIn={signedIn}
            profileHref={profileHref}
            sidebarPrefsTrusted={sidebarPrefsTrusted}
            sidebarPrefs={sidebarPrefs}
            initialConversations={initialConversations}
            initialFriends={initialFriends}
            initialIncoming={initialIncoming}
            initialOutgoing={initialOutgoing}
            initialUnreadNotifications={initialUnreadNotifications}
          >
            {children}
          </AppShellClient>
        </Providers>
      </body>
    </html>
  );
}
