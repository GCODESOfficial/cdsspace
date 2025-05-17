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
import { uploadFile, deleteFile } from "@/lib/storage-service"
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
          caption: img.caption,
          alt_text: img.alt_text,
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
    validateForm()
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

      let coverImagePath = originalCoverImage

      // Upload new cover image if changed
      if (coverImage) {
        coverImagePath = await uploadFile(coverImage, "covers")

        // Delete old cover image if it exists and is different
        if (originalCoverImage && originalCoverImage !== coverImagePath) {
          try {
            await deleteFile(originalCoverImage)
          } catch (error) {
            console.error("Error deleting old cover image:", error)
          }
        }
      }

      // Create update object
      const updateData = {
        title,
        description,
        cover_image: coverImagePath,
        category,
      }

      console.log("Update data:", updateData)

      // Update work entry
      const { error: workError } = await supabase.from("works").update(updateData).eq("id", workId)

      if (workError) throw workError

      // Handle image updates

      // 1. Find images to delete (in originalImages but not in projectImages)
      const imagesToDelete = originalImages.filter((origImg) => !projectImages.some((img) => img.id === origImg.id))

      // 2. Find images to add (new images in projectImages with file property)
      const imagesToAdd = projectImages.filter((img) => img.file && !img.id)

      // 3. Find images to update (in both arrays but with different properties)
      const imagesToUpdate = projectImages.filter(
        (img) =>
          img.id &&
          originalImages.some(
            (origImg) =>
              origImg.id === img.id &&
              (origImg.position !== img.position ||
                origImg.isFullWidth !== img.isFullWidth ||
                origImg.spanRows !== img.spanRows ||
                JSON.stringify(origImg.transformations) !== JSON.stringify(img.transformations)),
          ),
      )

      // Delete images
      if (imagesToDelete.length > 0) {
        // Delete from storage
        for (const img of imagesToDelete) {
          if (img.originalUrl) {
            try {
              await deleteFile(img.originalUrl)
            } catch (error) {
              console.error("Error deleting image:", error)
            }
          }
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from("work_images")
          .delete()
          .in("id", imagesToDelete.map((img) => img.id).filter(Boolean) as number[])

        if (deleteError) throw deleteError
      }

      // Add new images
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

        const { error: imagesError } = await supabase.from("work_images").insert(uploadedImages)

        if (imagesError) throw imagesError
      }

      // Update existing images
      for (const image of imagesToUpdate) {
        if (!image.id) continue

        const { error: updateError } = await supabase
          .from("work_images")
          .update({
            position: image.position,
            transformations: {
              size: image.size ?? { width: 100, height: 100 },
              isFullWidth: image.isFullWidth ?? false,
              spanRows: image.spanRows ?? 1,
              ...image.transformations,
            },
            caption: image.caption || null,
            alt_text: image.alt_text || null,
          })
          .eq("id", image.id)

        if (updateError) throw updateError
      }

      toast.success("Work updated successfully")
      router.push("/admin")
    } catch (error: any) {
      console.error("Error updating work:", error)
      toast.error(`Error updating work: ${error.message || "Please try again."}`)
    } finally {
      setIsSubmitting(false)
      setIsModalOpen(false)
    }
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
    <div className="min-h-screen bg-white text-black p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Edit Work</h1>
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
                  className="bg-white border-gray-300"
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

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-white border-gray-300">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-gray-300">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.slug} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <Button type="button" onClick={handlePrepareSubmit} className="bg-green-600 hover:bg-green-700">
              Save Changes
            </Button>
          </div>
        </form>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="bg-white text-black border-gray-300">
            <DialogHeader>
              <DialogTitle>Finalize Update</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="coverImage">Cover Image</Label>
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
              <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleFinalSubmit} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                {isSubmitting ? "Updating..." : "Update Work"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        
      </div>
    </div>
  )
}