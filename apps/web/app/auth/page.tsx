import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GuestButton } from "@/app/auth/guest-button";
import { GoogleSignInButton } from "@/app/google-sign-in-button";
import { getServerSession } from "@/lib/get-server-session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with your Google account to play and chat on Kyzen.",
};

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const googleOAuthReady = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  const session = await getServerSession();
  if (session?.user) redirect("/profile");

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-130 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <main className="w-full max-w-90">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-black/5 shadow-xl">
          <h1 className="text-center font-semibold text-card-foreground text-xl tracking-tight">
            Sign in
          </h1>

          <p className="mt-2 text-center text-muted-foreground text-sm">
            Use your Google account to continue.
          </p>

          <GoogleSignInButton googleOAuthReady={googleOAuthReady} />

          <GuestButton />

          {!googleOAuthReady ? (
            <p className="mt-4 text-center text-muted-foreground text-xs">
              Add <span className="font-mono">GOOGLE_CLIENT_ID</span> and{" "}
              <span className="font-mono">GOOGLE_CLIENT_SECRET</span> to{" "}
              <span className="font-mono">.env.local</span>, set the redirect
              URI to{" "}
              <span className="break-all font-mono text-[11px] text-muted-foreground">
                [your app URL]/api/auth/callback/google
              </span>
              , then restart the dev server.
            </p>
          ) : null}

          <p className="mt-8 text-center text-muted-foreground/60 text-xs">
            Email &amp; password: coming soon
          </p>
        </div>
      </main>
    </div>
  );
}
