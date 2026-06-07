"use client";

import { usePathname } from "next/navigation";
import { type RefObject, useEffect, useLayoutEffect } from "react";

const STORAGE_PREFIX = "gl-scroll:";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useScrollRestoration(ref: RefObject<HTMLElement | null>): void {
  const pathname = usePathname();

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const key = `${STORAGE_PREFIX}${pathname}`;
    try {
      const saved = sessionStorage.getItem(key);
      el.scrollTop = saved ? Number(saved) || 0 : 0;
    } catch {}

    let raf = 0;
    const save = () => {
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
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [pathname, ref]);
}
