"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ComponentRef, Ref } from "react";
import { useLiquidLens } from "@/components/glass/liquid-glass";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;

function PopoverContent({
  className = "",
  align = "start",
  side = "right",
  sideOffset = 8,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  ref?: Ref<ComponentRef<typeof PopoverPrimitive.Content>>;
}) {
  const lensRef =
    useLiquidLens<ComponentRef<typeof PopoverPrimitive.Content>>();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={(node) => {
          lensRef(node);
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={`fade-in-0 zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 glass-pane z-50 animate-in overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none data-[state=closed]:animate-out ${className}`}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger };
