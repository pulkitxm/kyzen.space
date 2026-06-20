import type { MouseEvent as ReactMouseEvent } from "react";

type PointerDragHandlers = {
  onMove: (ev: MouseEvent) => void;
  onEnd?: (ev: MouseEvent) => void;
  cursor?: string;
};

export function startPointerDrag(
  e: ReactMouseEvent,
  { onMove, onEnd, cursor }: PointerDragHandlers,
): void {
  e.preventDefault();
  document.body.style.userSelect = "none";
  if (cursor) document.body.style.cursor = cursor;

  const handleMove = (ev: MouseEvent) => onMove(ev);
  const handleUp = (ev: MouseEvent) => {
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);
    document.body.style.userSelect = "";
    if (cursor) document.body.style.cursor = "";
    onEnd?.(ev);
  };

  document.addEventListener("mousemove", handleMove);
  document.addEventListener("mouseup", handleUp);
}
