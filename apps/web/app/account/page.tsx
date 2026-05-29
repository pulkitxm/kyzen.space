import { redirect } from "next/navigation";

import { RevokeOthersForm } from "@/app/revoke-others-form";
import { SessionEndForm } from "@/app/session-end-form";
import { SignOutForm } from "@/app/sign-out-form";
import { Badge } from "@/components/ui/badge";
import { BackLink, PageContainer } from "@/components/ui/page";
import { getAccountSessions } from "@/lib/get-account-sessions";
import { formatTs, shortenId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { current, list } = await getAccountSessions();
  if (!current?.session || !current.user) redirect("/auth");

  const currentId = current.session.id;
  const otherSessions = list.filter((s) => s.id !== currentId);

  return (
    <PageContainer>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-page-ambient blur-[100px]" />
      </div>

      <BackLink href="/">← Home</BackLink>

      <div className="mt-8 rounded-2xl border border-border bg-card/80 p-8 shadow-xl shadow-black/5 backdrop-blur-md">
        <h1 className="text-xl font-semibold tracking-tight text-card-foreground">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{current.user.email}</p>

        <section className="mt-8" aria-labelledby="sessions-heading">
          <h2
            id="sessions-heading"
            className="text-sm font-medium text-card-foreground"
          >
            Active sessions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each sign-in from a browser or device may create a separate session.
          </p>

          <ul className="mt-4 space-y-3">
            {list.length === 0 ? (
              <li className="rounded-xl border border-border bg-surface-overlay/60 px-4 py-3 text-sm text-muted-foreground">
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
                      "rounded-xl border px-4 py-3 text-left text-sm shadow-sm " +
                      (isCurrent
                        ? "border-success-border bg-success-bg"
                        : "border-border bg-card")
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {shortenId(session.id)}…
                        </span>
                        {isCurrent ? (
                          <span className="rounded-full bg-success-label-bg px-2.5 py-0.5 text-[11px] font-medium text-success-label-text">
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
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
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
                          <dd className="inline font-mono">{session.ipAddress}</dd>
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

        <div className="mt-8 border-t border-border pt-6">
          <SignOutForm />
        </div>

        <RevokeOthersForm otherSessionCount={otherSessions.length} />
      </div>
    </PageContainer>
  );
}
