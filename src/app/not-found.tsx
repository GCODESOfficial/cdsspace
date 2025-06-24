"use client"

import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center text-white bg-[#000C17]">
      <div className="text-center space-y-6 px-6">
      <h1
						className="text-transparent bg-clip-text md:text-8xl text-4xl font-bold"
						style={{
							backgroundImage:
								"linear-gradient(to right, #040b37 30%, #8AADFF 70%)",
						}}
					>
						404
					</h1>
        <p className="text-2xl">Oops! Page not found.</p>
        <p className="text-md max-w-md mx-auto">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <Link
          href="/"
          className="w-full bg-gradient-to-b from-[#040b37] to-[#2950FF] transition border-[#C4CBEC] border text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          Go Back Home
        </Link>
      </div>
    </div>
  )
}