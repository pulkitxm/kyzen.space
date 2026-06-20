"use client";

import { useAtomValue, useSetAtom } from "jotai";
import {
  closeAllAtom,
  closeLayerAtom,
  openLayerAtom,
  popupLayersAtom,
} from "./atoms";

export function useLayeredPopup() {
  const layers = useAtomValue(popupLayersAtom);
  const openLayer = useSetAtom(openLayerAtom);
  const closeLayer = useSetAtom(closeLayerAtom);
  const closeAll = useSetAtom(closeAllAtom);

  return { openLayer, closeLayer, closeAll, layers };
}
