import type { AvatarConfig } from "@kyzen/avatar";
import type {
  ConversationJson,
  FriendshipJson,
  NotificationJson,
} from "@kyzen/shared/types";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import { AppShellClient } from "@/app/app-shell";
import { Providers } from "@/app/providers";
import { serverFetchJson } from "@/lib/api-server";
import { CHAT_LAYOUT_BOOT_SCRIPT } from "@/lib/chat-layout";
import { getServerSession } from "@/lib/get-server-session";
import { GLASS_BOOT_SCRIPT, type GlassMode } from "@/lib/glass";
import {
  DEFAULT_PATTERN,
  PATTERN_BOOT_SCRIPT,
  type PatternId,
  patternVars,
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
  title: "Kyzen",
  description: "Play live multiplayer games",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  const signedIn = Boolean(session?.user);
  const isAnonymous = Boolean(session?.user?.isAnonymous);

  const {
    username,
    avatar,
    userTheme,
    userMode,
    userPattern,
    userGlass,
    initialConversations,
    initialFriends,
    initialIncoming,
    initialOutgoing,
    initialNotifications,
    initialUnreadNotifications,
  } = await loadShellState(session?.user?.id);

  const profileHref = signedIn ? "/profile" : "/auth";

  const initialPatternVars = patternVars(userPattern ?? DEFAULT_PATTERN);
  const patternStyle = initialPatternVars
    ? ({
        "--pattern-url": initialPatternVars.url,
        "--pattern-tile": initialPatternVars.tile,
      } as React.CSSProperties)
    : undefined;

  const cookieStore = await cookies();
  const prefCookieRaw = cookieStore.get(SIDEBAR_PREFS_COOKIE)?.value;
  const sidebarPrefsTrusted =
    typeof prefCookieRaw === "string" && prefCookieRaw.length > 0;
  const sidebarPrefs = parseSidebarPrefsCookieValue(prefCookieRaw);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={userTheme ?? DEFAULT_THEME}
      data-pattern={userPattern ?? DEFAULT_PATTERN}
      data-glass={userGlass && userGlass !== "off" ? userGlass : undefined}
      style={patternStyle}
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
        <script
          id="gl-glass-bootstrap"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline boot script
          dangerouslySetInnerHTML={{ __html: GLASS_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full text-foreground">
        <Providers
          initialPalette={userTheme}
          initialMode={userMode}
          initialPattern={userPattern}
          initialGlass={userGlass}
          signedIn={signedIn}
        >
          <AppShellClient
            username={username}
            avatar={avatar}
            userId={session?.user?.id ?? null}
            signedIn={signedIn}
            isAnonymous={isAnonymous}
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

async function loadShellState(userId: string | undefined) {
  let username: string | null = null;
  let avatar: AvatarConfig | null = null;
  let userTheme: ThemeId | null = null;
  let userMode: ColorMode | null = null;
  let userPattern: PatternId | null = null;
  let userGlass: GlassMode | null = null;
  let initialConversations: ConversationJson[] = [];
  let initialFriends: FriendshipJson[] = [];
  let initialIncoming: FriendshipJson[] = [];
  let initialOutgoing: FriendshipJson[] = [];
  let initialNotifications: NotificationJson[] = [];
  let initialUnreadNotifications = 0;
  if (userId) {
    const [me, convs, fr, reqs, notif, notifList] = await Promise.all([
      serverFetchJson<{
        profile: {
          username: string;
          avatar: AvatarConfig | null;
          theme: ThemeId;
          colorMode: ColorMode;
          pattern: PatternId;
          glass: GlassMode;
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
    userGlass = me?.profile.glass ?? null;
    initialConversations = convs?.conversations ?? [];
    initialFriends = fr?.friends ?? [];
    initialIncoming = reqs?.incoming ?? [];
    initialOutgoing = reqs?.outgoing ?? [];
    initialUnreadNotifications = notif?.count ?? 0;
    initialNotifications = notifList?.notifications ?? [];
  }

  return {
    username,
    avatar,
    userTheme,
    userMode,
    userPattern,
    userGlass,
    initialConversations,
    initialFriends,
    initialIncoming,
    initialOutgoing,
    initialNotifications,
    initialUnreadNotifications,
  };
}
