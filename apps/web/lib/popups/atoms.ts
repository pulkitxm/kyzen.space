import { atom } from "jotai";
import type { ReactNode } from "react";

export type PopupSize = "sm" | "md" | "lg";

export type PopupRenderApi = {
  layer: number;
  openLayer: (config: PopupLayerInput) => number;
  closeLayer: (layer: number) => void;
  close: () => void;
  closeAll: () => void;
};

export type PopupNode = ReactNode | ((api: PopupRenderApi) => ReactNode);

export type PopupLayerInput = {
  title?: ReactNode;
  content: PopupNode;
  footer?: PopupNode;
  size?: PopupSize;
  persistent?: boolean;
  showClose?: boolean;
};

export type PopupLayer = {
  id: string;
  title?: ReactNode;
  content: PopupNode;
  footer?: PopupNode;
  size: PopupSize;
  persistent: boolean;
  showClose: boolean;
};

let sequence = 0;

export const popupLayersAtom = atom<PopupLayer[]>([]);

export const openLayerAtom = atom(
  null,
  (get, set, input: PopupLayerInput): number => {
    sequence += 1;
    const layer: PopupLayer = {
      id: `popup-${sequence}`,
      title: input.title,
      content: input.content,
      footer: input.footer,
      size: input.size ?? "md",
      persistent: input.persistent ?? false,
      showClose: input.showClose ?? true,
    };
    const next = [...get(popupLayersAtom), layer];
    set(popupLayersAtom, next);
    return next.length;
  },
);

export const closeLayerAtom = atom(null, (get, set, layer: number) => {
  set(popupLayersAtom, get(popupLayersAtom).slice(0, Math.max(0, layer - 1)));
});

export const closeAllAtom = atom(null, (_get, set) => {
  set(popupLayersAtom, []);
});
