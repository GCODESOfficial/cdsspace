/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { getSlugFromTitle } from "@/lib/utils"
import { CATEGORIES } from "@/lib/constants"
import Link from "next/link";

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
		  <div className="min-h-screen bg-white text-black p-6 flex items-center justify-center">
			<div className="text-center">
			  <div className="mx-auto mb-4 w-28 h-28  rounded-full overflow-hidden">
				<video
				  src="/loader.mp4"  // replace with your video path
				  autoPlay
				  loop
				  muted
				  playsInline
				  className="rounded-full object-fill h-24 w-24"
				/>
			  </div>
			  <p>Loading project details...</p>
			</div>
		  </div>
		);
	  }

  return (
    <div className="min-h-screen bg-white text-black md:pb-44 pb-32 ">

      

      <div className="">

        <div className="bg-[#edf0f6] pt-40  md:flex justify-center overflow-hidden">

          

          <div className="md:px-20 px-4 ">

            {/* Breadcrumb */}
			<div className="md:px-12 text-sm md:text-base">
				<Link href="/Works" className="hover:underline">
					Works
				</Link>{" "}
				&gt; <span className="text-black font-medium">categories</span>
			</div>
        
        <header className="mb-12 text-left border-b  md:pt-20 md:pb-40 pt-28 pb-32 md:w-screen md:px-10">
          <h1 className="text-4xl md:text-6xl max-w-3xl font-extrabold mb-2">{category.name}</h1>
        </header>
        </div>
        </div>

        <div className="md:flex justify-between py-32 md:py-44 max-w-6xl mx-auto px-4">
            <div className="text-left">
            <h1 className="font-extrabold text-2xl md:text-3xl">
            Overview
            </h1>
            <p>{category.name}</p>
            </div>
        <p className="text-black whitespace-pre-line text-sm md:text-base pl-7 md:pl-0 pt-28 md:pt-0 text-right mr-0 max-w-lg">{category.description}</p>
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
                <div className="absolute hidden inset-0 bg-gradient-to-t from-black/70 to-transparent text-[#D3D3D3]  opacity-0 hover:opacity-100 transition-opacity md:flex items-end">
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