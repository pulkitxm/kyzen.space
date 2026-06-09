"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentPropsWithoutRef, ComponentRef, Ref } from "react";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className = "",
  sideOffset = 8,
  side = "right",
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  ref?: Ref<ComponentRef<typeof TooltipPrimitive.Content>>;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        side={side}
        sideOffset={sideOffset}
        className={`fade-in-0 zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 z-50 animate-in overflow-hidden rounded-lg bg-sidebar px-3 py-2 text-sidebar-foreground text-sm shadow-md data-[state=closed]:animate-out ${className}`}
        {...props}
      >
        {props.children}
        <TooltipPrimitive.Arrow className="fill-sidebar" width={8} height={4} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
