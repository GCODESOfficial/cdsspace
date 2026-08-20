/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client"

import type React from "react"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EnhancedEditor, type ImageType } from "@/components/enhanced-editor"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { CATEGORIES } from "@/lib/constants"

export default function EditWorkPage() {
  const router = useRouter()
  const params = useParams()

  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string>("")
  const [originalCoverImage, setOriginalCoverImage] = useState("")

  const [title, setTitle] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [category, setCategory] = useState<string>("")
  const [industry, setIndustry] = useState<string>("")
  const [projectScope, setProjectScope] = useState<string>("")
  const [deliverables, setDeliverables] = useState<string>("")
  const [timeline, setTimeline] = useState<string>("")
  const [projectImages, setProjectImages] = useState<ImageType[]>([])
  const [originalImages, setOriginalImages] = useState<ImageType[]>([])
  const [workId, setWorkId] = useState<string | number | null>(null)

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [imagesLoaded, setImagesLoaded] = useState<boolean>(false)
  const [debugInfo, setDebugInfo] = useState<any>({})

  // Debug effect to monitor projectImages changes
  useEffect(() => {
    console.log("Project images updated:", projectImages)
  }, [projectImages])

  useEffect(() => {
    if (params.id) {
      fetchWorkDetails(params.id as string)
    }
  }, [params.id])

  async function fetchWorkDetails(id: string) {
    try {
      setLoading(true)
      setError(null)

      console.log("Fetching work details for ID:", id)
      setDebugInfo((prev: any) => ({ ...prev, workId: id }))

      // Fetch with the original ID
      const { data: workData, error: workError } = await supabase.from("works").select("*").eq("id", id).single()

      if (workError) {
        console.error("Error fetching work data:", workError)
        setDebugInfo((prev: any) => ({ ...prev, workError: workError.message }))
        throw workError
      }

      console.log("Work data fetched:", workData)
      setDebugInfo((prev: any) => ({ ...prev, workData }))

      // Store the work ID directly
      setWorkId(workData.id)

      // Use the ID from the fetched work data for subsequent queries
      const workId = workData.id

      // Fetch work images
      const { data: imagesData, error: imagesError } = await supabase
        .from("work_images")
        .select("*")
        .eq("work_id", workId)
        .order("position")

      if (imagesError) {
        console.error("Error fetching work images:", imagesError)
        setDebugInfo((prev: any) => ({ ...prev, imagesError: imagesError.message }))
        throw imagesError
      }

      console.log("Work images fetched:", imagesData)
      setDebugInfo((prev: any) => ({ ...prev, imagesData }))

      // Set work data
      setTitle(workData.title || "")
      setDescription(workData.description || "")
      setIndustry(workData.industry || "")
      setProjectScope(workData.project_scope || "")
      setDeliverables(workData.deliverables || "")
      setTimeline(workData.timeline || "")

      // Set category if it exists
      if (workData.category) {
        setCategory(workData.category)
      }

      // Set cover image
      if (workData.cover_image) {
        setOriginalCoverImage(workData.cover_image)
        setCoverImagePreview(workData.cover_image)
      }

      // Process images
      if (imagesData && imagesData.length > 0) {
        const processedImages = imagesData.map((img) => ({
          id: img.id,
          file: null, // No file for existing images
          preview: img.image_url,
          originalUrl: img.image_url,
          image_url: img.image_url,
          position: img.position || 0,
          size: img.transformations?.size || { width: 100, height: 100 },
          isFullWidth: img.transformations?.isFullWidth ?? false,
          spanRows: img.transformations?.spanRows || 1,
          transformations: img.transformations || {},
        }))

        console.log("Processed images:", processedImages)
        setDebugInfo((prev: any) => ({ ...prev, processedImages }))

        setProjectImages(processedImages)
        setOriginalImages(processedImages)
      } else {
        console.log("No images found for this work")
        setProjectImages([])
        setOriginalImages([])
      }

      setImagesLoaded(true)
    } catch (error: any) {
      console.error("Error fetching work details:", error)
      setError(error.message || "Failed to load project details.")
      setDebugInfo((prev: any) => ({ ...prev, finalError: error.message }))
      toast.error("Failed to load project details.")
    } finally {
      setLoading(false)
    }
  }

  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverImage(file)
      setCoverImagePreview(URL.createObjectURL(file))
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
  }

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
  }

  const validateForm = () => {
    console.log("Validating form. Project images:", projectImages.length)

    if (!title.trim()) {
      toast.error("Please enter a project title")
      return false
    }

    if (!category) {
      toast.error("Please select a category")
      return false
    }

    return true
  }

  const handlePrepareSubmit = () => {
    if (validateForm()) {
      setIsModalOpen(true)
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (validateForm()) {
      handleFinalSubmit()
    }
  }
  

  const handleFinalSubmit = async () => {
    if (!coverImage && !originalCoverImage) {
      toast.error("Cover image is required")
      return
    }

    if (!workId) {
      toast.error("Invalid work ID")
      return
    }

    try {
      setIsSubmitting(true)

      // Upload a changed cover; otherwise keep the existing URL.
      let coverImagePath = originalCoverImage
      if (coverImage) {
        coverImagePath = await uploadViaServer(coverImage, "covers")
      }

      // Build the full desired image set (in current order). New images (with a
      // `file`) get uploaded; existing images keep their URL.
      const images = await Promise.all(
        projectImages.map(async (image, index) => {
          const imageUrl = image.file
            ? await uploadViaServer(image.file as File, "works")
            : (image.image_url || image.originalUrl)
          return {
            image_url: imageUrl,
            position: image.position ?? index,
            transformations: {
              ...(image.transformations || {}),
              size: image.size ?? image.transformations?.size ?? { width: 100, height: 100 },
              isFullWidth: image.isFullWidth ?? image.transformations?.isFullWidth ?? false,
              spanRows: image.spanRows ?? image.transformations?.spanRows ?? 1,
            },
          }
        }),
      )

      const res = await fetch(`/api/admin/works/${workId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          cover_image: coverImagePath,
          category,
          industry: industry.trim() || null,
          project_scope: projectScope.trim() || null,
          deliverables: deliverables.trim() || null,
          timeline: timeline.trim() || null,
          images,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Please try again.")

      toast.success("Work updated successfully")
      setIsModalOpen(false)
      router.push("/admin")
    } catch (error: any) {
      console.error("Error updating work:", error)
      toast.error(`Error updating work: ${error.message || "Please try again."}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Upload one file through the server route (service-role storage, RLS-proof).
  const uploadViaServer = async (file: File, folder: "covers" | "works"): Promise<string> => {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("folder", folder)
    const res = await fetch("/api/admin/works/upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Failed to upload ${file.name}`)
    return data.url as string
  }

  // Create a handler function for the EnhancedEditor's onImagesChange prop
  const handleImagesChange = (images: ImageType[]) => {
    console.log("Images changed:", images)
    // Only update state if the images have actually changed
    const imagesJson = JSON.stringify(images)
    const currentImagesJson = JSON.stringify(projectImages)

    if (imagesJson !== currentImagesJson) {
      setProjectImages(images)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading project details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white text-black p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <Button variant="outline" onClick={() => router.push("/admin")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-black p-6 pt-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Edit Work</h1>
          <Button variant="outline" className="hover:bg-blue-50 cursor-pointer" onClick={() => router.push("/admin")}>
            Cancel
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-20 mt-24">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label htmlFor="title" className="mb-2 text-lg">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="Enter project title"
                  className="bg-white border-gray-300"
                />
              </div>

              <div>
                <Label htmlFor="description" className="mb-2 text-lg">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Enter project description"
                  rows={5}
                  className="bg-white border-gray-300 h-full min-h-[80px]"
                />
              </div>

              <div>
                <Label htmlFor="category" className="mb-2 text-lg">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-white border-gray-300">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg bg-[#0A4FE8] cursor-pointer text-white  border-gray-300">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.slug} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <Label htmlFor="industry" className="mb-2 text-lg">Industry</Label>
                  <Input
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Web3 / Blockchain Technology"
                    className="bg-white border-gray-300"
                  />
                </div>
                <div>
                  <Label htmlFor="timeline" className="mb-2 text-lg">Timeline</Label>
                  <Input
                    id="timeline"
                    value={timeline}
                    onChange={(e) => setTimeline(e.target.value)}
                    placeholder="e.g. 3 months"
                    className="bg-white border-gray-300"
                  />
                </div>
                <div>
                  <Label htmlFor="project_scope" className="mb-2 text-lg">Project Scope</Label>
                  <p className="text-xs text-gray-500 mb-1.5">One item per line.</p>
                  <Textarea
                    id="project_scope"
                    value={projectScope}
                    onChange={(e) => setProjectScope(e.target.value)}
                    rows={4}
                    placeholder={"Brand Identity\nUI/UX Design\nPrototyping\nDevelopment"}
                    className="bg-white border-gray-300 min-h-[100px]"
                  />
                </div>
                <div>
                  <Label htmlFor="deliverables" className="mb-2 text-lg">Deliverables</Label>
                  <p className="text-xs text-gray-500 mb-1.5">One item per line.</p>
                  <Textarea
                    id="deliverables"
                    value={deliverables}
                    onChange={(e) => setDeliverables(e.target.value)}
                    rows={4}
                    placeholder={"Logo\nLanding page\nApp UI\nAdmin Dashboard"}
                    className="bg-white border-gray-300 min-h-[100px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {imagesLoaded ? (
                <EnhancedEditor initialImages={projectImages} onImagesChange={handleImagesChange} />
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin mr-2" />
                  <p>Loading images...</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="button" onClick={handlePrepareSubmit} className="rounded-lg bg-[#0A4FE8] cursor-pointer text-white ">
              Save Changes
            </Button>
          </div>
        </form>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="bg-white text-black border-gray-300">
            <DialogHeader>
              <DialogTitle>Finalize Update</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-6">
              <div>
                <Label htmlFor="coverImage" className="text-lg mb-2">Cover Image</Label>
                <p className="text-xs text-gray-500 leading-snug mb-3">
                  <span className="font-semibold text-gray-700">Recommended: 1200 × 1500 px</span> (4:5 portrait).
                  Keep the subject centered - the card is ~397×496 px on the home page and ~443×504 px on the Work page, so edges may crop slightly. JPG, PNG, or WebP, under 2 MB.
                </p>
                <Input id="coverImage" type="file" accept="image/*" onChange={handleCoverImageChange} />
                {(coverImagePreview || originalCoverImage) && (
                  <div className="mt-2 relative aspect-video rounded-md overflow-hidden">
                    <img
                      src={coverImagePreview || originalCoverImage}
                      alt="Cover preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="hover:bg-blue-50 cursor-pointer" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleFinalSubmit} disabled={isSubmitting} className="rounded-lg bg-[#0A4FE8] cursor-pointer text-white ">
                {isSubmitting ? "Updating..." : "Update Work"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        
      </div>
    </div>
  )
}