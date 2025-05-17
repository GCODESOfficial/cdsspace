"use client"

import { toast as sonnerToast } from "sonner"

type ToastType = "success" | "error" | "info" | "warning" | "default" | "destructive"

interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastType
  duration?: number
}

export function useToast() {
  const toast = ({ title, description, variant = "default", duration = 5000 }: ToastOptions) => {
    switch (variant) {
      case "success":
        return sonnerToast.success(title, {
          description,
          duration,
        })
      case "error":
      case "destructive":
        return sonnerToast.error(title, {
          description,
          duration,
        })
      case "warning":
        return sonnerToast.warning(title, {
          description,
          duration,
        })
      case "info":
      case "default":
      default:
        return sonnerToast(title, {
          description,
          duration,
        })
    }
  }

  return { toast }
}

export { sonnerToast as toast }
