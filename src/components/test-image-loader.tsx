/* eslint-disable @next/next/no-img-element */
"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"

interface TestImageLoaderProps {
  imageUrls: string[]
}

export function TestImageLoader({ imageUrls }: TestImageLoaderProps) {
  const [loadStatus, setLoadStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const newStatus: Record<string, boolean> = {}
    imageUrls.forEach((url) => {
      newStatus[url] = false
    })
    setLoadStatus(newStatus)
  }, [imageUrls])

  const handleImageLoad = (url: string) => {
    setLoadStatus((prev) => ({
      ...prev,
      [url]: true,
    }))
  }

  const handleImageError = (url: string) => {
    console.error(`Failed to load image: ${url}`)
    setLoadStatus((prev) => ({
      ...prev,
      [url]: false,
    }))
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-lg font-medium mb-4">Image Loading Test</h3>
        <div className="grid grid-cols-2 gap-4">
          {imageUrls.map((url, index) => (
            <div key={index} className="border rounded-md p-2">
              <div className="mb-2 text-xs break-all">{url}</div>
              <div className="aspect-video relative rounded overflow-hidden">
                <img
                  src={url || "/placeholder.svg"}
                  alt={`Test image ${index}`}
                  className="w-full h-full object-cover"
                  onLoad={() => handleImageLoad(url)}
                  onError={() => handleImageError(url)}
                />
                <div
                  className={`absolute top-0 right-0 p-1 text-xs ${loadStatus[url] ? "bg-green-500" : "bg-red-500"}`}
                >
                  {loadStatus[url] ? "Loaded" : "Failed"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
