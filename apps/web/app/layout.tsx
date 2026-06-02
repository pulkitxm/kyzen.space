import type { AvatarConfig } from "@gamelobby/avatar";
import type {
  ConversationJson,
  FriendshipJson,
  NotificationJson,
} from "@gamelobby/chat-core";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import { AppShellClient } from "@/app/app-shell";
import { Providers } from "@/app/providers";
import { serverFetchJson } from "@/lib/api-server";
import { CHAT_LAYOUT_BOOT_SCRIPT } from "@/lib/chat-layout";
import { getServerSession } from "@/lib/get-server-session";
import {
  DEFAULT_PATTERN,
  PATTERN_BOOT_SCRIPT,
  type PatternId,
} from "@/lib/patterns";
import {
  parseSidebarPrefsCookieValue,
  SIDEBAR_LS_BOOT_SCRIPT,
  SIDEBAR_PREFS_COOKIE,
} from "@/lib/sidebar-prefs";
import {
  type ColorMode,
  DEFAULT_THEME,
  PALETTE_BOOT_SCRIPT,
  type ThemeId,
} from "@/lib/themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gamePaused = localFont({
  src: "./fonts/game-paused.otf",
  variable: "--font-game-paused-face",
  display: "swap",
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
  let userTheme: ThemeId | null = null;
  let userMode: ColorMode | null = null;
  let userPattern: PatternId | null = null;
  let initialConversations: ConversationJson[] = [];
  let initialFriends: FriendshipJson[] = [];
  let initialIncoming: FriendshipJson[] = [];
  let initialOutgoing: FriendshipJson[] = [];
  let initialNotifications: NotificationJson[] = [];
  let initialUnreadNotifications = 0;
  if (session?.user?.id) {
    const [me, convs, fr, reqs, notif, notifList] = await Promise.all([
      serverFetchJson<{
        profile: {
          username: string;
          avatar: AvatarConfig | null;
          theme: ThemeId;
          colorMode: ColorMode;
          pattern: PatternId;
        };
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
      serverFetchJson<{ notifications: NotificationJson[] }>(
        "/api/notifications?limit=50",
      ),
    ]);
    username = me?.profile.username ?? null;
    avatar = me?.profile.avatar ?? null;
    userTheme = me?.profile.theme ?? null;
    userMode = me?.profile.colorMode ?? null;
    userPattern = me?.profile.pattern ?? null;
    initialConversations = convs?.conversations ?? [];
    initialFriends = fr?.friends ?? [];
    initialIncoming = reqs?.incoming ?? [];
    initialOutgoing = reqs?.outgoing ?? [];
    initialUnreadNotifications = notif?.count ?? 0;
    initialNotifications = notifList?.notifications ?? [];
  }

  const profileHref = signedIn ? "/profile" : "/auth";

  const cookieStore = await cookies();
  const prefCookieRaw = cookieStore.get(SIDEBAR_PREFS_COOKIE)?.value;
  const sidebarPrefsTrusted =
    typeof prefCookieRaw === "string" && prefCookieRaw.length > 0;
  const sidebarPrefs = parseSidebarPrefsCookieValue(prefCookieRaw);
  
  // testing if this triggers an error

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={userTheme ?? DEFAULT_THEME}
      data-pattern={userPattern ?? DEFAULT_PATTERN}
      className={`${geistSans.variable} ${geistMono.variable} ${gamePaused.variable} h-full antialiased`}
    >
      <head>
        {}
        <script
          id="gl-sidebar-cookie-bootstrap"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline boot script
          dangerouslySetInnerHTML={{ __html: SIDEBAR_LS_BOOT_SCRIPT }}
        />
        <script
          id="gl-chat-layout-bootstrap"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline boot script
          dangerouslySetInnerHTML={{ __html: CHAT_LAYOUT_BOOT_SCRIPT }}
        />
        <script
          id="gl-palette-bootstrap"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline boot script
          dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT }}
        />
        <script
          id="gl-pattern-bootstrap"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline boot script
          dangerouslySetInnerHTML={{ __html: PATTERN_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full text-foreground">
        <Providers
          initialPalette={userTheme}
          initialMode={userMode}
          initialPattern={userPattern}
          signedIn={signedIn}
        >
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
            initialNotifications={initialNotifications}
            initialUnreadNotifications={initialUnreadNotifications}
          >
            {children}
          </AppShellClient>
        </Providers>
      </body>
    </html>
  );
}
