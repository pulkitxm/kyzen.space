import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShellClient } from "@/app/app-shell";
import { Providers } from "@/app/providers";
import { connectMongoose } from "@/database/mongoose";
import { UserProfile } from "@/database/models";
import { getServerSession } from "@/lib/get-server-session";
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
  title: "Game lib",
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
  if (session?.user?.id) {
    try {
      await connectMongoose();
      const profile = await UserProfile.findOne({ userId: session.user.id })
        .select({ username: 1 })
        .lean();
      username = profile?.username ?? null;
    } catch {
      // non-fatal — sidebar shows "Sign in" fallback
    }
  }

  const profileHref = signedIn ? (username ? `/${username}` : "/profile") : "/auth";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <AppShellClient
            username={username}
            signedIn={signedIn}
            profileHref={profileHref}
          >
            {children}
          </AppShellClient>
        </Providers>
      </body>
    </html>
  );
}
