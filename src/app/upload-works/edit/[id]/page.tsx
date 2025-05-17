/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getWorkById, updateWork, type Work } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-service"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Save } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const categories = ["Digital Art", "Photography", "Illustration", "3D Design", "Animation", "Graphic Design", "UI/UX"]

export default function EditWorkPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const workId = params.id as string

  const [name, setName] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [category, setCategory] = useState<string>("")
  const [mainImage, setMainImage] = useState<File | null>(null)
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null)
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const [originalWork, setOriginalWork] = useState<Work | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isLoadingWork, setIsLoadingWork] = useState<boolean>(true)

  useEffect(() => {
    if (workId) {
      loadWork(workId)
    }
  }, [workId])

  const loadWork = (id: string) => {
    try {
      setIsLoadingWork(true)
      const work = getWorkById(id)

      if (!work) {
        toast({
          title: "Error",
          description: "Work not found",
          variant: "destructive",
        })
        router.push("/")
        return
      }

      setOriginalWork(work)
      setName(work.name)
      setDescription(work.description)
      setCategory(work.category)
      setMainImagePreview(work.imageUrl)
      setCoverImagePreview(work.coverUrl)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load work",
        variant: "destructive",
      })
      router.push("/")
    } finally {
      setIsLoadingWork(false)
    }
  }

  const handleMainImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return
    }

    const file = e.target.files[0]
    setMainImage(file)

    const objectUrl = URL.createObjectURL(file)
    setMainImagePreview(objectUrl)
  }

  const handleCoverImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return
    }

    const file = e.target.files[0]
    setCoverImage(file)

    const objectUrl = URL.createObjectURL(file)
    setCoverImagePreview(objectUrl)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      })
      return
    }

    if (!category) {
      toast({
        title: "Error",
        description: "Please select a category",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)

      const updates: Partial<Omit<Work, "id" | "createdAt">> = {
        name,
        description,
        category,
      }

      // Upload new main image if provided
      if (mainImage) {
        const imageUrl = await uploadFile(mainImage, "works")
        updates.imageUrl = imageUrl
      }

      // Upload new cover image if provided
      if (coverImage) {
        const coverUrl = await uploadFile(coverImage, "covers")
        updates.coverUrl = coverUrl
      }

      // Update work
      updateWork(workId, updates)

      toast({
        title: "Success",
        description: "Work updated successfully",
      })

      router.push("/")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update work",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }

  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
  }

  if (isLoadingWork) {
    return (
      <div className="min-h-screen bg-[#0a0a14] text-white p-6 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-8">
          <Link href="/">
            <Button variant="ghost" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Edit Work</h1>
        </div>

        <Card className="bg-[#1a1a2e] border-none rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={handleNameChange}
                placeholder="Enter project name"
                className="bg-[#0a0a14] border-gray-700"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Project Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={handleDescriptionChange}
                placeholder="Enter project description"
                className="bg-[#0a0a14] border-gray-700 min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-[#0a0a14] border-gray-700">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-gray-700">
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mainImage">Main Image (Optional to change)</Label>
              <Input
                id="mainImage"
                type="file"
                accept="image/*"
                onChange={handleMainImageChange}
                className="bg-[#0a0a14] border-gray-700"
              />

              {mainImagePreview && (
                <div className="mt-2 relative w-full h-60 bg-[#0a0a14] rounded-md overflow-hidden">
                  <Image
                    src={mainImagePreview || "/placeholder.svg"}
                    alt="Main Image Preview"
                    fill
                    className="object-contain"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverImage">Cover Image (Optional)</Label>
              <Input
                id="coverImage"
                type="file"
                accept="image/*"
                onChange={handleCoverImageChange}
                className="bg-[#0a0a14] border-gray-700"
              />

              {coverImagePreview && (
                <div className="mt-2 relative w-full h-40 bg-[#0a0a14] rounded-md overflow-hidden">
                  <Image
                    src={coverImagePreview || "/placeholder.svg"}
                    alt="Cover Image Preview"
                    fill
                    className="object-contain"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Link href="/">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-transparent border-gray-700 text-white hover:bg-[#2a2a4e]"
                >
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
