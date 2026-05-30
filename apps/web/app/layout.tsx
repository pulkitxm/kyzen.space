import type { AvatarConfig } from "@gamelobby/avatar";
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
  if (session?.user?.id) {
    const me = await serverFetchJson<{
      profile: { username: string; avatar: AvatarConfig | null };
    }>("/api/profiles/me");
    username = me?.profile.username ?? null;
    avatar = me?.profile.avatar ?? null;
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
          >
            {children}
          </AppShellClient>
        </Providers>
      </body>
    </html>
  );
}
