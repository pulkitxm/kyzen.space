import type { Metadata } from "next";
import { RevokeOthersForm } from "@/app/revoke-others-form";
import { SessionEndForm } from "@/app/session-end-form";
import { AccountIdentityForm } from "@/app/settings/account-identity-form";
import { SignOutForm } from "@/app/sign-out-form";
import { Badge } from "@/components/ui/badge";
import { serverFetchJson } from "@/lib/api-server";
import { getAccountSessions } from "@/lib/get-account-sessions";
import { formatTs, shortenId } from "@/lib/utils";

type ProfileResponse = {
  profile: {
    username: string;
    usernameEditableAt: string | null;
    usernameChangeCooldownDays: number;
  };
  user: { name: string | null };
};

export const metadata: Metadata = {
  title: "Account · Settings · GameLobby",
};

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const { current, list } = await getAccountSessions();
  const signedIn = Boolean(current?.session && current.user);
  const currentId = current?.session?.id;
  const otherSessions = list.filter((s) => s.id !== currentId);
  const profileData = signedIn
    ? await serverFetchJson<ProfileResponse>("/api/profiles/me")
    : null;

  if (!signedIn) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 text-muted-foreground text-sm shadow-sm sm:p-6">
        Sign in to manage your account.
      </section>
    );
  }

  return (
    <section
      aria-labelledby="account-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4">
        <h2
          id="account-heading"
          className="font-medium text-foreground text-lg"
        >
          Account
        </h2>
        <p className="mt-0.5 text-muted-foreground text-sm">
          {current?.user?.email}
        </p>
      </div>

      {profileData ? (
        <AccountIdentityForm
          name={profileData.user.name}
          username={profileData.profile.username}
          usernameEditableAt={profileData.profile.usernameEditableAt}
          cooldownDays={profileData.profile.usernameChangeCooldownDays}
        />
      ) : null}

      <section aria-labelledby="sessions-heading">
        <h3
          id="sessions-heading"
          className="font-medium text-foreground text-sm"
        >
          Active sessions
        </h3>
        <p className="mt-1 text-muted-foreground text-xs">
          Each sign-in from a browser or device may create a separate session.
        </p>

        <ul className="mt-4 space-y-3">
          {list.length === 0 ? (
            <li className="rounded-xl border border-border bg-surface-overlay/60 px-4 py-3 text-muted-foreground text-sm">
              No sessions returned.
            </li>
          ) : (
            list.map((session) => {
              const isCurrent = session.id === currentId;
              const token =
                typeof session.token === "string" ? session.token : "";
              return (
                <li
                  key={session.id}
                  className={
                    "rounded-xl border px-4 py-3 text-left text-sm shadow-sm" +
                    (isCurrent
                      ? "border-success-border bg-success-bg"
                      : "border-border bg-card")
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="font-mono text-muted-foreground text-xs">
                        {shortenId(session.id)}…
                      </span>
                      {isCurrent ? (
                        <span className="rounded-full bg-success-label-bg px-2.5 py-0.5 font-medium text-[11px] text-success-label-text">
                          Current session
                        </span>
                      ) : (
                        <Badge>Other session</Badge>
                      )}
                    </div>
                    {token && !isCurrent ? (
                      <SessionEndForm token={token} />
                    ) : null}
                  </div>
                  <dl className="mt-2 space-y-1 text-muted-foreground text-xs">
                    <div>
                      <dt className="inline">Started </dt>
                      <dd className="inline">{formatTs(session.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="inline">Expires </dt>
                      <dd className="inline">{formatTs(session.expiresAt)}</dd>
                    </div>
                    {session.ipAddress ? (
                      <div>
                        <dt className="inline">IP </dt>
                        <dd className="inline font-mono">
                          {session.ipAddress}
                        </dd>
                      </div>
                    ) : null}
                    {session.userAgent ? (
                      <div className="line-clamp-2 break-all">
                        <dt className="sr-only">Device</dt>
                        <dd>{session.userAgent}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <div className="mt-6 border-border border-t pt-6">
        <SignOutForm />
      </div>

      <RevokeOthersForm otherSessionCount={otherSessions.length} />
    </section>
  );
}
