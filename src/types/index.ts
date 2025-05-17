import type { ImageType } from "@/components/enhanced-editor"

// Re-export ImageType for use in other files
export type { ImageType }

export type Work = {
  id: number
  title: string
  description: string
  cover_image: string
  category?: string
  created_at: string
}
