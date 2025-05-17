/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getSlugFromTitle } from "@/lib/utils"
import { CATEGORIES } from "@/lib/constants"

export default function WorkCategoryPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const [works, setWorks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const category = CATEGORIES.find((cat) => cat.slug === slug)

  useEffect(() => {
    if (slug) {
      fetchWorks()
    }
  }, [slug])

  async function fetchWorks() {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from("works")
        .select("*")
        .eq("category", category?.name)
        .order("created_at", { ascending: false })

      if (error) throw error
      setWorks(data || [])
    } catch (error) {
      console.error("Error fetching works:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleWorkClick = (work: any) => {
    const titleSlug = getSlugFromTitle(work.title)
    router.push(`/Works/work/${titleSlug}`)
  }

  if (!category) {
    return <p className="text-center text-black py-12">Category not found.</p>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading works...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-black md:pb-40 pb-20 ">
      <div className="">

        <div className="bg-[#edf0f6] md:py-40 pt-40 md:pt-0 pb-20 md:pb-0 ">

          <div className="md:px-20 px-8">
        
        <header className="mb-12 text-left border-b md:pb-32 ">
          <h1 className="text-5xl md:text-6xl max-w-md font-bold mb-2">{category.name}</h1>
        </header>
        </div>
        </div>

        <div className="md:flex justify-between py-16 max-w-6xl mx-auto px-4">
            <div className="text-left">
            <h1 className="font-bold text-2xl">
            Overview
            </h1>
            <p>{category.name}</p>
            </div>
        <p className="text-black whitespace-pre-line pt-20 md:pt-0 md:text-right mr-0 max-w-md">{category.category_description}</p>
        </div>

        <div className="max-w-6xl mx-auto px-4">

        {works.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {works.map((work) => (
              <div
                key={work.id}
                className="work-card aspect-[4/3] relative overflow-hidden rounded-lg cursor-pointer"
                onClick={() => handleWorkClick(work)}
              >
                <img
                  src={work.cover_image || "/placeholder.svg?height=300&width=400"}
                  alt={work.title}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end">
                  <div className="p-4">
                    <h3 className="text-lg font-medium">{work.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-black">No works available in this category.</p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}