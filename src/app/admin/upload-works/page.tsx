/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client"

import type React from "react"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EnhancedEditor, type ImageType } from "@/components/enhanced-editor"
import { uploadFile } from "@/lib/storage-service"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { CATEGORIES } from "@/lib/constants"

export default function UploadWorkPage() {
  const router = useRouter()

  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string>("")
  const [title, setTitle] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [category, setCategory] = useState<string>("")
  const [projectImages, setProjectImages] = useState<ImageType[]>([])

  const [showModal, setShowModal] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [debugInfo, setDebugInfo] = useState<any>({})

  // Debug effect to monitor projectImages changes
  useEffect(() => {
    console.log("Project images updated:", projectImages)
  }, [projectImages])

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

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value)
  }

  const validateForm = () => {
    console.log("Validating form. Project images:", projectImages.length)

    if (!title.trim()) {
      toast.error("Please enter a project title")
      return false
    }

    // Check if there are any images with files
    const hasImages = projectImages.some((img) => img.file)
    if (!hasImages) {
      toast.error("Please add at least one image")
      return false
    }

    return true
  }

  const handleContinueToUpload = () => {
    if (validateForm()) {
      setShowModal(true)
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    validateForm()
  }

  const handleFinalSubmit = async () => {
    if (!coverImage) {
      toast.error("Cover image is required")
      return
    }

    if (!category) {
      toast.error("Please select a category")
      return
    }

    try {
      setIsSubmitting(true)

      // Upload cover image
      const coverImagePath = await uploadFile(coverImage, "covers")

      // Create insert object
      const insertData = {
        title,
        description,
        cover_image: coverImagePath,
        category,
      }

      console.log("Insert data:", insertData)
      setDebugInfo((prev: any) => ({ ...prev, insertData }))

      // Insert work entry
      const { data: workData, error: workError } = await supabase.from("works").insert(insertData).select()

      if (workError) throw workError

      console.log("Work data inserted:", workData)
      setDebugInfo((prev: any) => ({ ...prev, workData }))

      // Get the inserted work ID
      const workId = workData[0].id

      // Upload project images
      const imagesToAdd = projectImages.filter((img) => img.file)

      if (imagesToAdd.length > 0) {
        const uploadedImages = await Promise.all(
          imagesToAdd.map(async (image, index) => {
            if (!image.file) {
              throw new Error("File is required for new images")
            }

            const imagePath = await uploadFile(image.file, "works")
            return {
              work_id: workId,
              image_url: imagePath,
              position: image.position ?? index,
              transformations: {
                size: image.size ?? { width: 100, height: 100 },
                isFullWidth: image.isFullWidth ?? false,
                spanRows: image.spanRows ?? 1,
                ...image.transformations,
              },
              caption: image.caption || null,
              alt_text: image.alt_text || null,
            }
          }),
        )

        console.log("Images to insert:", uploadedImages)
        setDebugInfo((prev: any) => ({ ...prev, uploadedImages }))

        const { data: insertedImages, error: imagesError } = await supabase
          .from("work_images")
          .insert(uploadedImages)
          .select()

        if (imagesError) throw imagesError

        console.log("Images inserted:", insertedImages)
        setDebugInfo((prev: any) => ({ ...prev, insertedImages }))
      }

      toast.success("Work uploaded successfully")
      router.push("/admin")
    } catch (error: any) {
      console.error("Error uploading work:", error)
      setDebugInfo((prev: any) => ({ ...prev, error: error.message }))
      toast.error(`Error uploading work: ${error.message || "Please try again."}`)
    } finally {
      setIsSubmitting(false)
      setShowModal(false)
    }
  }

  // Create a handler function for the EnhancedEditor's onImagesChange prop
  const handleImagesChange = (images: ImageType[]) => {
    console.log("Images changed:", images)
    setProjectImages(images)
  }

  return (
    <div className="min-h-screen bg-white text-black p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Upload New Work</h1>
          <Button variant="outline" onClick={() => router.push("/admin")}>
            Cancel
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="Enter project title"
                  className="bg-wite border-gray-700"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Enter project description"
                  rows={5}
                  className="bg-white border-gray-300 h-full min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <EnhancedEditor initialImages={[]} onImagesChange={handleImagesChange} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleContinueToUpload}
              className="bg-green-600 hover:bg-green-700 px-6 py-2 text-lg font-medium"
            >
              Continue to Upload
            </Button>
          </div>
        </form>

        {/* Simple Modal Implementation */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Finalize Upload</h2>

              <div className="space-y-4 mb-6">
                <div>
                  <label htmlFor="category" className="block text-sm font-medium mb-1">
                    Select Category
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={handleCategoryChange}
                    className="w-full bg-white border border-gray-300 rounded-md p-2"
                    required
                  >
                    <option value="">Select a category</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.slug} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="coverImage" className="block text-sm font-medium mb-1">
                    Cover Image
                  </label>
                  <input
                    id="coverImage"
                    type="file"
                    accept="image/*"
                    onChange={handleCoverImageChange}
                    className="w-full bg-white border border-gray-300 rounded-md p-2"
                  />
                  {coverImagePreview && (
                    <div className="mt-2 relative aspect-video rounded-md overflow-hidden">
                      <img
                        src={coverImagePreview || "/placeholder.svg"}
                        alt="Cover preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-blue-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md"
                >
                  {isSubmitting ? "Uploading..." : "Upload Work"}
                </button>
              </div>
            </div>
          </div>
        )}

        
      </div>
    </div>
  )
}