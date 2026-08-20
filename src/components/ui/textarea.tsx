import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-brand-stroke placeholder:text-muted-foreground flex field-sizing-content min-h-24 w-full rounded-xl border bg-white px-3.5 py-3 text-base text-brand-navy shadow-sm transition-[border-color,box-shadow,background-color] outline-none focus:border-brand-blue/40 focus:ring-4 focus:ring-blue-100/80 aria-invalid:border-rose-300 aria-invalid:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
