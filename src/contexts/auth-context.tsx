"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Session, User } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const setData = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (error) {
        console.error(error)
        setSession(null)
        setUser(null)
      } else {
        setSession(session)
        setUser(session?.user ?? null)
      }
      setIsLoading(false)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    setData()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Auth guarding for dashboard routes is handled server-side by middleware
  // (src/middleware.ts → updateSession), which refreshes the session cookie
  // and redirects only when there is genuinely no user. We intentionally do
  // NOT redirect from the client here: a transient null during session hydration
  // was bouncing logged-in clients back to /login while navigating.

  const signIn = async (email: string, password: string) => {
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) {
        router.push("/dashboard")
        router.refresh()
      }
      return { error }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    const supabase = createClient()

    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const value = {
    user,
    session,
    isLoading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
