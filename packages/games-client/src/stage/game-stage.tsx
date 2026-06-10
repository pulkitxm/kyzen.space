"use client";

import type { ReactNode } from "react";
import { ConnectionDot } from "./connection-dot";

export function GameStage({
  dock,
  status,
  connection,
  notice,
  error,
  children,
  footer,
}: {
  dock?: ReactNode;
  status?: ReactNode;
  connection?: { show: boolean; online: boolean };
  notice?: ReactNode;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const hasStatusRow = Boolean(status) || Boolean(connection?.show);

  return (
    <div className="mt-8">
      {dock}
      {hasStatusRow ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {status ?? <span />}
          {connection?.show ? (
            <ConnectionDot online={connection.online} />
          ) : null}
        </div>
      ) : null}
      {notice}
      {error ? (
        <p role="alert" className="mb-4 text-danger text-sm">
          {error}
        </p>
      ) : null}
      {children}
      {footer}
    </div>
  );
}
