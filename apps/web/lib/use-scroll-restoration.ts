"use client";

import { usePathname } from "next/navigation";
import { type RefObject, useEffect } from "react";

const STORAGE_PREFIX = "gl-scroll:";
const RESTORE_SETTLE_MS = 1000;

export function useScrollRestoration(ref: RefObject<HTMLElement | null>): void {
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const key = `${STORAGE_PREFIX}${pathname}`;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(key)) || 0;
    } catch {}

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let restoring = false;
    let settleTimer = 0;
    if (saved > 0) {
      restoring = true;
      el.scrollTo({ top: saved, behavior: reduceMotion ? "auto" : "smooth" });
      settleTimer = window.setTimeout(() => {
        restoring = false;
      }, RESTORE_SETTLE_MS);
    } else {
      el.scrollTop = 0;
    }

    let raf = 0;
    const save = () => {
      if (restoring) return;
      try {
        sessionStorage.setItem(key, String(el.scrollTop));
      } catch {}
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(save);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      restoring = false;
      save();
    };
  }, [pathname, ref]);
}
