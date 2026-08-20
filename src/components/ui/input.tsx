import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-brand-stroke flex h-11 w-full min-w-0 rounded-xl border bg-white px-3.5 py-2 text-base text-brand-navy shadow-sm transition-[border-color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus:border-brand-blue/40 focus:ring-4 focus:ring-blue-100/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 md:text-[13px]",
        "aria-invalid:border-rose-300 aria-invalid:ring-rose-100",
        className
      )}
      {...props}
    />
  )
}

export { Input }
