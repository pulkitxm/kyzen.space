"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaPalette, FaUser } from "react-icons/fa6";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/account", label: "Account", Icon: FaUser },
  { href: "/settings/appearance", label: "Appearance", Icon: FaPalette },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="inline-flex w-fit rounded-xl border border-border bg-surface p-1"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
