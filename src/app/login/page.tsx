/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, type FormEvent } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import Image from "next/image"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuth()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await signIn(email, password)
      if (error) {
        toast.error("Login failed", {
          description: error.message || "Please check your credentials and try again.",
        })
      }
    } catch (error) {
      toast.error("Login failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#151D48]">
      <Card className="w-full max-w-md bg-gradient-to-b rounded-lg from-[#08129C] to-[#071056]  border-none text-white">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-6">
            <Image src="/images/cds-logo.svg" alt="CDS Logo" width={120} height={45} />
          </div>
          <CardTitle className="text-3xl">Admin Login</CardTitle>
          <CardDescription className="text-gray-400">
            Enter your credentials to access the admin dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 ">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-[#E7E7E7] outline-none text-[#071056]"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-[#E7E7E7] text-[#071056] outline-none"
              />
            </div>
            <Button type="submit" className="w-full text-[#071056] text-base font-bold bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] border-none" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-white">
            Return to Home Page
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
