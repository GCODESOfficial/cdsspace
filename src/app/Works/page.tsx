/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getSlugFromTitle } from "@/lib/utils"
import { CATEGORIES } from "@/lib/constants"

export default function WorkPage() {
  const router = useRouter()
  const [categoryWorks, setCategoryWorks] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWorksByCategory()
  }, [])

  async function fetchWorksByCategory() {
    try {
      setLoading(true)

      const initialCategoryWorks: Record<string, any[]> = {}
      CATEGORIES.forEach((category) => {
        initialCategoryWorks[category.slug] = []
      })

      const { data, error } = await supabase
        .from("works")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error

      if (data) {
        data.forEach((work) => {
          const categoryObj = CATEGORIES.find((cat) => cat.name === work.category)
          if (categoryObj) {
            if (!initialCategoryWorks[categoryObj.slug]) {
              initialCategoryWorks[categoryObj.slug] = []
            }
            initialCategoryWorks[categoryObj.slug].push(work)
          }
        })
      }

      setCategoryWorks(initialCategoryWorks)
    } catch (error) {
      console.error("Error fetching works:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryClick = (categorySlug: string) => {
    router.push(`/Works/categories/${categorySlug}`)
  }

  const handleWorkClick = (work: any) => {
    const titleSlug = getSlugFromTitle(work.title)
    router.push(`/Works/work/${titleSlug}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading portfolio...</span>
      </div>
    )
  }

  const categoriesWithWorks = CATEGORIES.filter(
    (category) => categoryWorks[category.slug] && categoryWorks[category.slug].length > 0,
  )

  return (
    <div className="min-h-screen md:pt-16 pt-40 bg-white text-black flex justify-center items-center">
      <div className="md:max-w-6xl mx-auto md:px-10 md:py-40">
        <header className="mb-16 text-center border-b pb-14">
          <h1 className="text-5xl md:text-7xl font-black leading md:text-left">
            Your Brand
            <br />
            Your Culture
            <br />
            <span className="text-blue-500">Our Touch</span>
          </h1>
          <p className="max-w-lg mx-auto text-black md:mt-4 mt-8 md:text-right md:mr-0">
          With CDS Space, you can be confident that your brand is in good hands. We&apos;ll help you build a brand that is emotionally resonant, valuable, and truly stands out.
          </p>
        </header>

        <div className="md:space-y-24 md:pt-24 pt-10 px-6 md:px-0">
          {categoriesWithWorks.map((category) => {
            const works = categoryWorks[category.slug]?.slice(0, 4)

            return (
              <section key={category.slug} className="category-section md:space-y-32 space-y-16 flex space-x-8">
                <div>
                <div
                  className="cursor-pointer mb-2"
                  onClick={() => handleCategoryClick(category.slug)}
                >
                  <h2 className="text-2xl md:text-5xl font-black max-w-md">{category.name}</h2>
                </div>

                <p className="text-black mb-4 max-w-md whitespace-pre-line">
                  {category.description || "Explore creative work done in this category."}
                </p>

                <div className="mt-4">
                  <button
                    onClick={() => handleCategoryClick(category.slug)}
                    className="hover:bg-blue-50 border text-black px-6 py-2 rounded-full transition"
                  >
                    View More
                  </button>
                </div>
                </div>

                {works.length > 0 && (
                  <div className="md:grid grid-cols-1 gap-4 hidden">
                    {works.map((work) => (
                      <div
                        key={work.id}
                        className="relative overflow-hidden rounded-lg cursor-pointer aspect-[4/3]"
                        onClick={() => handleWorkClick(work)}
                      >
                        <img
                          src={work.cover_image || "/placeholder.svg?height=300&width=400"}
                          alt={work.title}
                          className="w-80 h-80 object-cover transition-transform hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end">
                          <div className="p-4">
                            <h3 className="text-md font-medium">{work.title}</h3>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
