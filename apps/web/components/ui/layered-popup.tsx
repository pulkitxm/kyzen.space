"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";
import { GlassMotionPane } from "@/components/glass/glass-pane";
import {
  closeAllAtom,
  closeLayerAtom,
  openLayerAtom,
  type PopupNode,
  type PopupRenderApi,
  type PopupSize,
  popupLayersAtom,
} from "@/lib/popups/atoms";
import { cn } from "@/lib/utils";

const SIZE_CLASS: Record<PopupSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function renderNode(node: PopupNode, api: PopupRenderApi) {
  return typeof node === "function" ? node(api) : node;
}

export function LayeredPopupHost() {
  const layers = useAtomValue(popupLayersAtom);
  const openLayer = useSetAtom(openLayerAtom);
  const closeLayer = useSetAtom(closeLayerAtom);
  const closeAll = useSetAtom(closeAllAtom);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const count = layers.length;

  useEffect(() => {
    if (count === 0) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [count]);

  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!layers[count - 1]?.persistent) closeLayer(count);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, layers, closeLayer]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {layers.map((layer, index) => {
        const layerNumber = index + 1;
        const api: PopupRenderApi = {
          layer: layerNumber,
          openLayer,
          closeLayer,
          close: () => closeLayer(layerNumber),
          closeAll,
        };
        const hasHeader = layer.title != null || layer.showClose;
        return (
          <m.div
            key={layer.id}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 100 + index }}
          >
            <m.button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              disabled={layer.persistent}
              onClick={() => !layer.persistent && closeLayer(layerNumber)}
              className="glass-scrim absolute inset-0 bg-black/50 disabled:cursor-default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            />
            <GlassMotionPane
              role="dialog"
              aria-modal="true"
              className={cn(
                "relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl",
                SIZE_CLASS[layer.size],
              )}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              {hasHeader && (
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="min-w-0 truncate font-semibold text-lg">
                    {layer.title}
                  </h2>
                  {layer.showClose && (
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => closeLayer(layerNumber)}
                      className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-overlay hover:text-foreground"
                    >
                      <FaXmark size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
              <div>{renderNode(layer.content, api)}</div>
              {layer.footer != null && (
                <div className="mt-4 flex items-center justify-end gap-2">
                  {renderNode(layer.footer, api)}
                </div>
              )}
            </GlassMotionPane>
          </m.div>
        );
      })}
    </AnimatePresence>,
    document.body,
  );
}
