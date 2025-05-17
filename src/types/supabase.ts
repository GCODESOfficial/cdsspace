export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      works: {
        Row: {
          id: string
          name: string
          description: string
          category: string
          image_path: string
          cover_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description: string
          category: string
          image_path: string
          cover_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string
          category?: string
          image_path?: string
          cover_path?: string | null
          updated_at?: string
        }
      }
      brands: {
        Row: {
          id: string
          name: string
          order: number
          selected: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          order: number
          selected: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          order?: number
          selected?: boolean
        }
      }
      advertisements: {
        Row: {
          id: string
          image_path: string
          link: string
          created_at: string
        }
        Insert: {
          id?: string
          image_path: string
          link: string
          created_at?: string
        }
        Update: {
          id?: string
          image_path?: string
          link?: string
        }
      }
      carrier_links: {
        Row: {
          id: string
          url: string
          created_at: string
        }
        Insert: {
          id?: string
          url: string
          created_at?: string
        }
        Update: {
          id?: string
          url?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}