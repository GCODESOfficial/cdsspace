"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  return (
    <ToastProvider>
      {/* Replace with the logic for individual toasts when required */}
      <Toast>
        <div className="grid gap-1">
          <ToastTitle>Title Here</ToastTitle>
          <ToastDescription>Description Here</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  )
}
