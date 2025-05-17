/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, type FormEvent, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addWork } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-service"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Upload } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const categories = ["Digital Art", "Photography", "Illustration", "3D Design", "Animation", "Graphic Design", "UI/UX"]

export default function UploadWorksPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [name, setName] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [mainImage, setMainImage] = useState<File | null>(null)
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null)
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const [category, setCategory] = useState<string>("")

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const handleMainImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      setMainImage(null)
      setMainImagePreview(null)
      return
    }

    const file = e.target.files[0]
    setMainImage(file)

    const objectUrl = URL.createObjectURL(file)
    setMainImagePreview(objectUrl)
  }

  const handleCoverImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      setCoverImage(null)
      setCoverImagePreview(null)
      return
    }

    const file = e.target.files[0]
    setCoverImage(file)

    const objectUrl = URL.createObjectURL(file)
    setCoverImagePreview(objectUrl)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      })
      return
    }

    if (!mainImage) {
      toast({
        title: "Error",
        description: "Please upload a main image",
        variant: "destructive",
      })
      return
    }

    setIsModalOpen(true)
  }

  const handleFinalSubmit = async () => {
    if (!category) {
      toast({
        title: "Error",
        description: "Please select a category",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)

      // Upload images
      const imageUrl = await uploadFile(mainImage!, "works")
      let coverUrl = ""

      if (coverImage) {
        coverUrl = await uploadFile(coverImage, "covers")
      }

      // Add work
      // Add work
await addWork({
  name,
  description,
  category,
  imageUrl,
  coverUrl,
})


      toast({
        title: "Success",
        description: "Work uploaded successfully",
      })

      router.push("/")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload work",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
      setIsModalOpen(false)
    }
  }

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }

  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
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
          <h1 className="text-2xl font-bold">Upload New Work</h1>
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
              <Label htmlFor="mainImage">Main Image</Label>
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

            <div className="flex justify-end">
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                <Upload className="h-4 w-4 mr-2" />
                Continue to Upload
              </Button>
            </div>
          </form>
        </Card>

        {/* Category and Cover Image Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="bg-[#1a1a2e] text-white border-gray-700">
            <DialogHeader>
              <DialogTitle>Finalize Upload</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">Select Category</Label>
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
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="bg-transparent border-gray-700 text-white hover:bg-[#2a2a4e]"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? "Uploading..." : "Upload Work"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
