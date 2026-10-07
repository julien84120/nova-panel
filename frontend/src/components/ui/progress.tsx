import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  indicatorClassName,
  indicatorStyle,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string; indicatorStyle?: React.CSSProperties }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("bg-muted relative h-1.5 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("bg-primary h-full w-full flex-1 rounded-full transition-all duration-700", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)`, ...indicatorStyle }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
