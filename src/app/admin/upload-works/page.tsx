/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client"

import type React from "react"
import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { EnhancedEditor, type ImageType } from "@/components/enhanced-editor"
import { uploadFile } from "@/lib/storage-service"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { CATEGORIES } from "@/lib/constants"
import { Upload, ImagePlus, Loader2, X } from "lucide-react"

export default function UploadWorkPage() {
  const router = useRouter()
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [industry, setIndustry] = useState("")
  const [projectScope, setProjectScope] = useState("")
  const [deliverables, setDeliverables] = useState("")
  const [timeline, setTimeline] = useState("")
  const [projectImages, setProjectImages] = useState<ImageType[]>([])
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setCoverImage(file); setCoverImagePreview(URL.createObjectURL(file)) }
  }

  const validateForm = () => {
    if (!title.trim()) { toast.error("Please enter a project title"); return false }
    const hasImages = projectImages.some((img) => img.file)
    if (!hasImages) { toast.error("Please add at least one image"); return false }
    return true
  }

  const handleContinueToUpload = () => { if (validateForm()) setShowModal(true) }

  const handleFinalSubmit = async () => {
    if (!coverImage) { toast.error("Cover image is required"); return }
    if (!category) { toast.error("Please select a category"); return }
    try {
      setIsSubmitting(true)
      const coverImagePath = await uploadFile(coverImage, "covers")
      const { data: workData, error: workError } = await supabase
        .from("works").insert({
          title,
          description,
          cover_image: coverImagePath,
          category,
          industry: industry.trim() || null,
          project_scope: projectScope.trim() || null,
          deliverables: deliverables.trim() || null,
          timeline: timeline.trim() || null,
        }).select()
      if (workError) throw workError
      const workId = workData[0].id
      const imagesToAdd = projectImages.filter((img) => img.file)
      if (imagesToAdd.length > 0) {
        const uploadedImages = await Promise.all(
          imagesToAdd.map(async (image, index) => {
            if (!image.file) throw new Error("File is required")
            const imagePath = await uploadFile(image.file, "works")
            return {
              work_id: workId, image_url: imagePath, position: image.position ?? index,
              transformations: {
                size: image.size ?? { width: 100, height: 100 },
                isFullWidth: image.isFullWidth ?? false,
                spanRows: image.spanRows ?? 1, ...image.transformations,
              }
            }
          })
        )
        const { error: imagesError } = await supabase.from("work_images").insert(uploadedImages).select()
        if (imagesError) throw imagesError
      }
      toast.success("Work uploaded successfully")
      router.push("/admin")
    } catch (error: any) {
      toast.error(`Error: ${error.message || "Please try again."}`)
    } finally { setIsSubmitting(false); setShowModal(false) }
  }

  return (
    <div className="p-8 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Portfolio</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Upload New Work</h1>
        </div>
        <button onClick={() => router.push("/admin")} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
          Cancel
        </button>
      </div>

      {/* Form */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Project Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter project title"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter project description" rows={4}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Web3 / Blockchain Technology"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Timeline</label>
              <input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="e.g. 3 months"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Project Scope</label>
              <p className="text-[11px] text-gray-400 mb-1.5">One item per line.</p>
              <textarea value={projectScope} onChange={(e) => setProjectScope(e.target.value)} rows={4}
                placeholder={"Brand Identity\nUI/UX Design\nPrototyping\nDevelopment"}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Deliverables</label>
              <p className="text-[11px] text-gray-400 mb-1.5">One item per line.</p>
              <textarea value={deliverables} onChange={(e) => setDeliverables(e.target.value)} rows={4}
                placeholder={"Logo\nLanding page\nApp UI\nAdmin Dashboard"}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <EnhancedEditor initialImages={[]} onImagesChange={(images) => setProjectImages(images)} />
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={handleContinueToUpload}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
            <Upload className="w-4 h-4" /> Continue
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[#0D1B39]">Finalize Upload</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                  <option value="">Select a category</option>
                  {CATEGORIES.map((cat) => <option key={cat.slug} value={cat.name}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Cover Image</label>
                <p className="text-[11px] text-gray-500 leading-snug mb-2">
                  <span className="font-semibold text-gray-700">Recommended: 1200 × 1500 px</span> (4:5 portrait).
                  Keep the subject centered — the card is ~397×496 px on the home page and ~443×504 px on the Work page, so edges may crop slightly. JPG, PNG, or WebP, under 2 MB.
                </p>
                <input type="file" accept="image/*" onChange={handleCoverImageChange}
                  className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-gray-200 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer" />
                {coverImagePreview && (
                  <div className="mt-3 rounded-xl overflow-hidden border border-gray-100">
                    <img src={coverImagePreview} alt="Cover preview" className="w-full h-40 object-cover" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} disabled={isSubmitting}
                className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleFinalSubmit} disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : "Upload Work"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
