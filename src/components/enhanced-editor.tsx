/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  ArrowRight,
  Maximize,
  Minimize,
  Move,
  Trash2,
  LayoutGrid,
  Maximize2,
  ArrowUp,
  ArrowDown,
  Type,
  Info,
} from "lucide-react"

// Define proper types for the component
export type ImageType = {
  id?: number
  file: File | null
  preview?: string | null
  originalUrl?: string | null
  image_url?: string
  position: number
  size?: { width: number; height: number }
  isFullWidth?: boolean
  spanRows?: number
  transformations?: Record<string, any>
  caption?: string
  alt_text?: string
}

type EnhancedEditorProps = {
  initialImages?: ImageType[]
  onImagesChange: (images: ImageType[]) => void
}

type GridItem = {
  image: ImageType
  index: number
  isFullWidth: boolean
  spanRows: number
  height: number
}

type GridRow = {
  items: GridItem[]
  height: number
}

export function EnhancedEditor({ initialImages = [], onImagesChange }: EnhancedEditorProps) {
  // Initialize with empty array to prevent errors if initialImages is undefined
  const [images, setImages] = useState<ImageType[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [editingCaption, setEditingCaption] = useState<boolean>(false)
  const [editingAltText, setEditingAltText] = useState<boolean>(false)
  const [tempCaption, setTempCaption] = useState<string>("")
  const [tempAltText, setTempAltText] = useState<string>("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Use refs to prevent infinite loops
  const initializedRef = useRef<boolean>(false)
  const prevImagesRef = useRef<ImageType[]>([])

  // Debug effect to monitor images state
  useEffect(() => {
    console.log("EnhancedEditor images state:", images)
  }, [images])

  // Debug effect to monitor initialImages prop
  useEffect(() => {
    console.log("EnhancedEditor initialImages prop:", initialImages)
  }, [initialImages])

  // Process initialImages when they change
  useEffect(() => {
    console.log("Processing initialImages:", initialImages)

    if (!initialImages || initialImages.length === 0) {
      console.log("No initialImages provided, using empty array")
      if (images.length === 0 && !initializedRef.current) {
        setImages([])
        initializedRef.current = true
      }
      return
    }

    // Only process if initialImages has actually changed
    const initialImagesJson = JSON.stringify(initialImages)
    const prevImagesJson = JSON.stringify(prevImagesRef.current)

    if (initialImagesJson === prevImagesJson && initializedRef.current) {
      return
    }

    // Process the images
    const processedImages = initialImages.map((img) => ({
      ...img,
      id: img.id || undefined,
      file: img.file || null,
      preview: img.preview || img.image_url || null,
      originalUrl: img.originalUrl || img.image_url || null,
      position: img.position || 0,
      size: img.size || (img.transformations?.size ? { ...img.transformations.size } : { width: 100, height: 100 }),
      isFullWidth: img.isFullWidth || img.transformations?.isFullWidth === true || false,
      spanRows: img.spanRows || img.transformations?.spanRows || 1,
      transformations: img.transformations || {},
      caption: img.caption || "",
      alt_text: img.alt_text || "",
    }))

    console.log("EnhancedEditor processed images:", processedImages)
    setImages(processedImages)
    initializedRef.current = true
    prevImagesRef.current = initialImages
  }, [images.length, initialImages])

  // Update parent component when images change
  useEffect(() => {
    if (images.length === 0 && !initializedRef.current) {
      return
    }

    // Use a ref to track the previous images state to avoid unnecessary updates
    const currentImagesJson = JSON.stringify(images)
    const prevImagesJson = JSON.stringify(prevImagesRef.current)

    if (currentImagesJson !== prevImagesJson) {
      console.log("EnhancedEditor calling onImagesChange with:", images)
      onImagesChange(images)
    }
  }, [images, onImagesChange])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    console.log("EnhancedEditor files selected:", files)

    const newImages = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      position: images.length + files.indexOf(file),
      size: { width: 100, height: 100 }, // Default size percentage
      isFullWidth: false, // Default to half width
      spanRows: 1, // Default to spanning 1 row (normal)
      transformations: {},
      caption: "",
      alt_text: "",
    }))

    console.log("EnhancedEditor new images:", newImages)
    setImages([...images, ...newImages])
    if (e.target.value) {
      e.target.value = "" // Reset input using empty string instead of null
    }
  }

  const handleRemoveImage = (index: number) => {
    const newImages = [...images]
    // Only revoke URL if it's a preview URL we created (not a server URL)
    if (newImages[index].preview && !newImages[index].originalUrl) {
      URL.revokeObjectURL(newImages[index].preview)
    }
    newImages.splice(index, 1)

    // Update positions after removal
    newImages.forEach((img, i) => {
      img.position = i
    })

    setImages(newImages)
    if (selectedIndex === index) {
      setSelectedIndex(null)
    } else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1)
    }
  }

  const handleMoveImage = (index: number, direction: number) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === images.length - 1)) {
      return
    }

    const newImages = [...images]
    const temp = newImages[index]
    newImages[index] = newImages[index + direction]
    newImages[index + direction] = temp

    // Update positions
    newImages.forEach((img, i) => {
      img.position = i
    })

    setImages(newImages)
    setSelectedIndex(index + direction)
  }

  const handleResizeImage = (index: number, sizeChange: number) => {
    const newImages = [...images]
    const currentSize = newImages[index].size || { width: 100, height: 100 }

    // Ensure size stays between 50% and 150%
    const newWidth = Math.max(50, Math.min(150, currentSize.width + sizeChange))
    const newHeight = Math.max(50, Math.min(150, currentSize.height + sizeChange))

    newImages[index].size = { width: newWidth, height: newHeight }
    setImages(newImages)
  }

  const toggleImageWidth = (index: number) => {
    const newImages = [...images]
    newImages[index].isFullWidth = !newImages[index].isFullWidth
    setImages(newImages)
  }

  const toggleRowSpan = (index: number, increase = true) => {
    const newImages = [...images]
    const currentSpan = newImages[index].spanRows || 1

    // If increasing, add one row span, if decreasing, remove one (minimum 1)
    const newSpan = increase ? currentSpan + 1 : Math.max(1, currentSpan - 1)

    newImages[index].spanRows = newSpan
    setImages(newImages)
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setIsDragging(true)
    setDragStartIndex(index)
    setSelectedIndex(index)
    // This is needed for Firefox
    e.dataTransfer.setData("text/plain", index.toString())
    // Make the drag image transparent
    const img = new Image()
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
    e.dataTransfer.setDragImage(img, 0, 0)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()

    if (dragStartIndex === null || dragStartIndex === index) {
      setIsDragging(false)
      setDragStartIndex(null)
      setDragOverIndex(null)
      return
    }

    // Reorder the images
    const newImages = [...images]
    const [movedItem] = newImages.splice(dragStartIndex, 1)
    newImages.splice(index, 0, movedItem)

    // Update positions
    newImages.forEach((img, i) => {
      img.position = i
    })

    setImages(newImages)
    setSelectedIndex(index)
    setIsDragging(false)
    setDragStartIndex(null)
    setDragOverIndex(null)
  }

  const startEditingCaption = (index: number) => {
    setSelectedIndex(index)
    setTempCaption(images[index].caption || "")
    setEditingCaption(true)
  }

  const startEditingAltText = (index: number) => {
    setSelectedIndex(index)
    setTempAltText(images[index].alt_text || "")
    setEditingAltText(true)
  }

  const saveCaption = () => {
    if (selectedIndex === null) return

    const newImages = [...images]
    newImages[selectedIndex].caption = tempCaption
    setImages(newImages)
    setEditingCaption(false)
  }

  const saveAltText = () => {
    if (selectedIndex === null) return

    const newImages = [...images]
    newImages[selectedIndex].alt_text = tempAltText
    setImages(newImages)
    setEditingAltText(false)
  }

  // Create a grid layout that properly handles row spanning and full-width images
  const createGridLayout = (): GridRow[] => {
    if (!images || images.length === 0) return []

    // Sort images by position
    const sortedImages = [...images].sort((a, b) => a.position - b.position)

    // Initialize our grid structure
    const grid: GridRow[] = []

    // Process each image and create rows
    let currentRow: GridItem[] = []
    let currentRowHeight = 0

    sortedImages.forEach((image, index) => {
      // Get isFullWidth and spanRows from either direct properties or transformations
      const isFullWidth = image.isFullWidth || false
      const spanRows = image.spanRows || 1

      // Standard height calculation
      const standardHeight = 12 // rem
      const imageHeight = spanRows * standardHeight

      if (isFullWidth) {
        // If there are images in the current row, push it and start a new row
        if (currentRow.length > 0) {
          grid.push({
            items: [...currentRow],
            height: currentRowHeight,
          })
          currentRow = []
          currentRowHeight = 0
        }

        // Add this full-width image as its own row
        grid.push({
          items: [{ image, index, isFullWidth, spanRows, height: imageHeight }],
          height: imageHeight,
        })
      } else {
        // Add half-width image to current row
        currentRow.push({ image, index, isFullWidth, spanRows, height: imageHeight })
        currentRowHeight = Math.max(currentRowHeight, imageHeight)

        // If we have 2 images in the row, push it and start a new row
        if (currentRow.length === 2) {
          grid.push({
            items: [...currentRow],
            height: currentRowHeight,
          })
          currentRow = []
          currentRowHeight = 0
        }
      }
    })

    // Add any remaining images in the last row
    if (currentRow.length > 0) {
      grid.push({
        items: [...currentRow],
        height: currentRowHeight,
      })
    }

    return grid
  }

  const gridRows = createGridLayout()

  return (
    <div className="space-y-4 text-white" ref={containerRef}>
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Project Images ({images.length})</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Add Images
        </Button>
        <Input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          multiple
          onChange={handleFileChange}
        />
      </div>

      {images.length > 0 ? (
        <div className="space-y-4">
          {gridRows.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-2 gap-4" style={{ height: `${row.height}rem` }}>
              {row.items.map(({ image, index, isFullWidth, spanRows }) => (
                <div
                  key={index}
                  className={`
                    relative border rounded-md overflow-hidden
                    ${selectedIndex === index ? "ring-2 ring-primary" : ""}
                    ${isDragging && dragOverIndex === index ? "border-dashed border-primary" : ""}
                    cursor-move
                    ${isFullWidth ? "col-span-2" : ""}
                  `}
                  style={{
                    height: "100%",
                    gridColumn: isFullWidth ? "span 2" : "span 1",
                  }}
                  onClick={() => setSelectedIndex(index)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={() => {
                    setIsDragging(false)
                    setDragStartIndex(null)
                    setDragOverIndex(null)
                  }}
                >
                  <div
                    className="h-full overflow-hidden"
                    style={{
                      transform: `scale(${(image.size?.width || 100) / 100})`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.preview || image.originalUrl || image.image_url || "/placeholder.svg"}
                      alt={image.alt_text || `Project image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Caption display */}
                  {image.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-sm">{image.caption}</div>
                  )}

                  {selectedIndex === index && (
                    <div className="absolute bottom-0 left-0 right-0 bg-background/80 p-1 flex justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMoveImage(index, -1)
                        }}
                        disabled={index === 0}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleImageWidth(index)
                        }}
                        title={image.isFullWidth ? "Make half width" : "Make full width"}
                      >
                        {image.isFullWidth ? <LayoutGrid className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleRowSpan(index, true)
                        }}
                        title="Expand vertically"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleRowSpan(index, false)
                        }}
                        title="Reduce vertical span"
                        disabled={(image.spanRows || 1) <= 1}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleResizeImage(index, 10)
                        }}
                      >
                        <Maximize className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleResizeImage(index, -10)
                        }}
                      >
                        <Minimize className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMoveImage(index, 1)
                        }}
                        disabled={index === images.length - 1}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="absolute top-1 right-1 flex space-x-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditingCaption(index)
                      }}
                      title="Add caption"
                    >
                      <Type className="h-3 w-3" />
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditingAltText(index)
                      }}
                      title="Add alt text"
                    >
                      <Info className="h-3 w-3" />
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveImage(index)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="absolute top-1 left-1 bg-background/80 rounded-full h-5 w-5 flex items-center justify-center text-xs">
                    {index + 1}
                  </div>

                  {spanRows > 1 && (
                    <div className="absolute top-1 left-8 bg-background/80 rounded-md px-1 text-xs">
                      {spanRows} rows
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          <Move className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>Drag and drop images here or click &quot;Add Images&quot;</p>
        </div>
      )}

      {/* Caption editing modal */}
      {editingCaption && selectedIndex !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] p-6 rounded-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Add Caption</h2>
            <div className="mb-4">
              <Input
                value={tempCaption}
                onChange={(e) => setTempCaption(e.target.value)}
                placeholder="Enter image caption"
                className="bg-[#0a0a14] border-gray-700"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingCaption(false)}>
                Cancel
              </Button>
              <Button onClick={saveCaption}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Alt text editing modal */}
      {editingAltText && selectedIndex !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] p-6 rounded-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Add Alt Text</h2>
            <div className="mb-4">
              <Input
                value={tempAltText}
                onChange={(e) => setTempAltText(e.target.value)}
                placeholder="Enter image alt text"
                className="bg-[#0a0a14] border-gray-700"
              />
              <p className="text-xs text-gray-400 mt-1">
                Alt text helps describe the image to screen readers and improves accessibility.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingAltText(false)}>
                Cancel
              </Button>
              <Button onClick={saveAltText}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Debug section - only visible in development */}
      {process.env.NODE_ENV === "development" && (
        <details className="mt-4 p-2 border border-dashed border-gray-700 rounded-md">
          <summary className="cursor-pointer text-sm">Debug Information</summary>
          <div className="mt-2 text-xs">
            <p>Images Count: {images.length}</p>
            <p>Initial Images Count: {initialImages?.length || 0}</p>
            <p>Selected Index: {selectedIndex !== null ? selectedIndex : "none"}</p>
          </div>
        </details>
      )}
    </div>
  )
}