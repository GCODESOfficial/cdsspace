/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
"use client"

import { useState, useRef, useEffect, type DragEvent, type ChangeEvent, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"
import { Upload, Trash2, Move, ZoomIn, ZoomOut, RotateCw, RotateCcw, ArrowUp, ArrowDown, Layers } from "lucide-react"

interface CanvasImage {
  id: string
  file: File
  url: string
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  rotation: number
  zIndex: number
}

interface CanvasEditorProps {
  onImagesReady: (files: File[]) => void
}

export function CanvasEditor({ onImagesReady }: CanvasEditorProps) {
  const [canvasHeight, setCanvasHeight] = useState(600)
  const [images, setImages] = useState<CanvasImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [editMode, setEditMode] = useState<"move" | "resize">("move")

  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedImage = images.find((img) => img.id === selectedImageId)

  // Handle file selection
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const newFiles = Array.from(e.target.files)
    addImagesToCanvas(newFiles)

    // Reset the input
    e.target.value = ""
  }

  // Add images to canvas
  const addImagesToCanvas = async (files: File[]) => {
    const newImages: CanvasImage[] = []

    for (const file of files) {
      try {
        // Create object URL for preview
        const url = URL.createObjectURL(file)

        // Get image dimensions
        const dimensions = await getImageDimensions(url)

        // Calculate scaled dimensions to fit in canvas
        const maxWidth = canvasRef.current?.clientWidth ? canvasRef.current.clientWidth - 40 : 500
        let width = dimensions.width
        let height = dimensions.height

        if (width > maxWidth) {
          const ratio = maxWidth / width
          width = maxWidth
          height = height * ratio
        }

        newImages.push({
          id: crypto.randomUUID(),
          file,
          url,
          x: 20,
          y: images.length * 20 + 20,
          width,
          height,
          originalWidth: dimensions.width,
          originalHeight: dimensions.height,
          rotation: 0,
          zIndex: images.length + 1,
        })
      } catch (error) {
        console.error("Error adding image:", error)
        toast.error("Failed to add image", {
          description: "There was an error processing the image.",
        })
      }
    }

    setImages((prev) => [...prev, ...newImages])

    // Select the last added image
    if (newImages.length > 0) {
      setSelectedImageId(newImages[newImages.length - 1].id)
    }
  }

  // Get image dimensions
  const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = () => {
        reject(new Error("Failed to load image"))
      }
      img.src = url
      img.crossOrigin = "anonymous"
    })
  }

  // Handle drag and drop
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      addImagesToCanvas(files)
    }
  }

  // Handle image selection
  const handleImageClick = (e: MouseEvent, imageId: string) => {
    e.stopPropagation()
    setSelectedImageId(imageId)
  }

  // Handle canvas click (deselect)
  const handleCanvasClick = () => {
    setSelectedImageId(null)
  }

  // Handle image drag start
  const handleImageDragStart = (e: MouseEvent, imageId: string) => {
    e.stopPropagation()

    if (editMode !== "move") return

    setIsDragging(true)
    setSelectedImageId(imageId)
    setDragStartPos({ x: e.clientX, y: e.clientY })
  }

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !selectedImageId) return

    const deltaX = e.clientX - dragStartPos.x
    const deltaY = e.clientY - dragStartPos.y

    setImages((prev) =>
      prev.map((img) => {
        if (img.id === selectedImageId) {
          return {
            ...img,
            x: img.x + deltaX,
            y: img.y + deltaY,
          }
        }
        return img
      }),
    )

    setDragStartPos({ x: e.clientX, y: e.clientY })
  }

  // Handle mouse up
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle image resize
  const handleResize = (value: number[]) => {
    if (!selectedImageId) return

    const scale = value[0] / 100

    setImages((prev) =>
      prev.map((img) => {
        if (img.id === selectedImageId) {
          return {
            ...img,
            width: img.originalWidth * scale,
            height: img.originalHeight * scale,
          }
        }
        return img
      }),
    )
  }

  // Handle image rotation
  const handleRotate = (direction: "cw" | "ccw") => {
    if (!selectedImageId) return

    const rotationChange = direction === "cw" ? 90 : -90

    setImages((prev) =>
      prev.map((img) => {
        if (img.id === selectedImageId) {
          return {
            ...img,
            rotation: (img.rotation + rotationChange) % 360,
          }
        }
        return img
      }),
    )
  }

  // Handle image deletion
  const handleDeleteImage = () => {
    if (!selectedImageId) return

    setImages((prev) => {
      const newImages = prev.filter((img) => img.id !== selectedImageId)
      // Update z-indices
      return newImages.map((img, index) => ({
        ...img,
        zIndex: index + 1,
      }))
    })

    setSelectedImageId(null)
  }

  // Handle layer ordering
  const handleLayerOrder = (direction: "up" | "down") => {
    if (!selectedImageId) return

    setImages((prev) => {
      const currentIndex = prev.findIndex((img) => img.id === selectedImageId)
      if (currentIndex === -1) return prev

      const newImages = [...prev]

      if (direction === "up" && currentIndex < newImages.length - 1) {
        // Swap with the next image
        const temp = newImages[currentIndex].zIndex
        newImages[currentIndex].zIndex = newImages[currentIndex + 1].zIndex
        newImages[currentIndex + 1].zIndex = temp
      } else if (direction === "down" && currentIndex > 0) {
        // Swap with the previous image
        const temp = newImages[currentIndex].zIndex
        newImages[currentIndex].zIndex = newImages[currentIndex - 1].zIndex
        newImages[currentIndex - 1].zIndex = temp
      }

      return newImages.sort((a, b) => a.zIndex - b.zIndex)
    })
  }

  // Handle canvas height change
  const handleCanvasHeightChange = (value: number[]) => {
    setCanvasHeight(value[0])
  }

  // Handle final submission
  const handleSubmit = async () => {
    if (images.length === 0) {
      toast.error("No images added", {
        description: "Please add at least one image to the canvas.",
      })
      return
    }

    // Extract all files in order
    const files = images.sort((a, b) => a.zIndex - b.zIndex).map((img) => img.file)

    onImagesReady(files)
  }

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        URL.revokeObjectURL(img.url)
      })
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium">Canvas Editor</h3>
          <p className="text-sm text-gray-400">Drag and drop images or use the upload button</p>
        </div>
        <div className="flex gap-2">
          <div>
            <Input
              id="image-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Label htmlFor="image-upload" asChild>
              <Button variant="outline" className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                Upload Images
              </Button>
            </Label>
          </div>
          <Button variant="default" className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit}>
            Continue
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="relative border border-gray-700 bg-[#0a0a14] rounded-md overflow-hidden flex-1"
          style={{ height: `${canvasHeight}px` }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {images.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Drag and drop images here</p>
              </div>
            </div>
          )}

          {images.map((img) => (
            <div
              key={img.id}
              className={`absolute cursor-move ${img.id === selectedImageId ? "ring-2 ring-blue-500" : ""}`}
              style={{
                left: `${img.x}px`,
                top: `${img.y}px`,
                width: `${img.width}px`,
                height: `${img.height}px`,
                transform: `rotate(${img.rotation}deg)`,
                zIndex: img.zIndex,
              }}
              onClick={(e) => handleImageClick(e, img.id)}
              onMouseDown={(e) => handleImageDragStart(e, img.id)}
            >
              <img
                src={img.url || "/placeholder.svg"}
                alt="Canvas item"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="w-full md:w-64 bg-[#1a1a2e] rounded-md p-4 space-y-4">
          <div>
            <Label htmlFor="canvas-height">Canvas Height</Label>
            <div className="flex items-center gap-2">
              <Slider
                id="canvas-height"
                min={300}
                max={2000}
                step={10}
                value={[canvasHeight]}
                onValueChange={handleCanvasHeightChange}
                className="flex-1"
              />
              <span className="text-xs w-12 text-right">{canvasHeight}px</span>
            </div>
          </div>

          <div className="h-px bg-gray-700 my-4" />

          {selectedImage ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Image</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={editMode === "move" ? "bg-blue-900/30" : ""}
                    onClick={() => setEditMode("move")}
                  >
                    <Move className="h-4 w-4 mr-1" /> Move
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={editMode === "resize" ? "bg-blue-900/30" : ""}
                    onClick={() => setEditMode("resize")}
                  >
                    <ZoomIn className="h-4 w-4 mr-1" /> Resize
                  </Button>
                </div>
              </div>

              {editMode === "resize" && (
                <div>
                  <Label>Size</Label>
                  <div className="flex items-center gap-2">
                    <ZoomOut className="h-4 w-4 text-gray-400" />
                    <Slider
                      min={10}
                      max={200}
                      step={1}
                      value={[Math.round((selectedImage.width / selectedImage.originalWidth) * 100)]}
                      onValueChange={handleResize}
                      className="flex-1"
                    />
                    <ZoomIn className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              )}

              <div>
                <Label>Rotation</Label>
                <div className="flex gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => handleRotate("ccw")}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleRotate("cw")}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Layer</Label>
                <div className="flex gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => handleLayerOrder("up")}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLayerOrder("down")}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <div className="flex-1" />
                  <Button variant="destructive" size="sm" onClick={handleDeleteImage}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-gray-400">
              <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select an image to edit</p>
            </div>
          )}

          <div className="h-px bg-gray-700 my-4" />

          <div>
            <p className="text-sm font-medium mb-2">Images ({images.length})</p>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {images.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">No images added</p>
              ) : (
                images
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((img) => (
                    <div
                      key={img.id}
                      className={`flex items-center p-1 rounded cursor-pointer ${img.id === selectedImageId ? "bg-blue-900/30" : "hover:bg-gray-800"}`}
                      onClick={(e) => handleImageClick(e, img.id)}
                    >
                      <div className="w-8 h-8 bg-black rounded overflow-hidden mr-2">
                        <img
                          src={img.url || "/placeholder.svg"}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="text-xs truncate flex-1">{img.file.name}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}