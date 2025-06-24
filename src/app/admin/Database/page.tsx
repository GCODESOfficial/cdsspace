/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"

export default function DatabaseCheckPage() {
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<any[]>([])
  const [works, setWorks] = useState<any[]>([])
  const [workImages, setWorkImages] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkDatabase()
  }, [])

  async function checkDatabase() {
    try {
      setLoading(true)
      setError(null)

      // Since _tables doesn't exist, we'll check tables directly
      const tablesToCheck = ["works", "work_images"]
      const tableResults = []

      for (const table of tablesToCheck) {
        try {
          const { data, error } = await supabase.from(table).select("count").limit(1).single()
          if (!error) {
            tableResults.push({ name: table, exists: true })
          } else {
            tableResults.push({ name: table, exists: false, error: error.message })
          }
        } catch (err: any) {
          tableResults.push({ name: table, exists: false, error: err.message })
        }
      }

      setTables(tableResults)

      // Get sample works
      const { data: worksData, error: worksError } = await supabase.from("works").select("*").limit(5)

      if (worksError) {
        console.error("Error fetching works:", worksError)
        setError(worksError.message)
      } else {
        setWorks(worksData || [])
      }

      // Get sample work_images
      const { data: imagesData, error: imagesError } = await supabase.from("work_images").select("*").limit(10)

      if (imagesError) {
        console.error("Error fetching work_images:", imagesError)
        if (!error) setError(imagesError.message)
      } else {
        setWorkImages(imagesData || [])
      }
    } catch (err: any) {
      console.error("Error checking database:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function createWorkImagesTable() {
    try {
      setLoading(true)

      // Check if the table already exists
      const { error: checkError } = await supabase.from("work_images").select("count").limit(1)

      if (!checkError) {
        toast.error("work_images table already exists")
        return
      }

      // Create the work_images table
      const { error: createError } = await supabase.rpc("create_work_images_table")

      if (createError) {
        // Try direct SQL if RPC fails
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS work_images (
            id SERIAL PRIMARY KEY,
            work_id UUID REFERENCES works(id) ON DELETE CASCADE,
            image_url TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            transformations JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `

        const { error: sqlError } = await supabase.rpc("run_sql", { sql: createTableSQL })

        if (sqlError) {
          throw sqlError
        }
      }

      toast.success("work_images table created successfully")
      checkDatabase() // Refresh data
    } catch (err: any) {
      console.error("Error creating table:", err)
      toast.error(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function fixWorkImagesRelationship() {
    try {
      setLoading(true)

      // Get all works
      const { data: worksData, error: worksError } = await supabase.from("works").select("*")

      if (worksError) throw worksError

      // Get all work_images
      const { data: imagesData, error: imagesError } = await supabase.from("work_images").select("*")

      if (imagesError) throw imagesError

      let fixCount = 0

      // Check for work_images with invalid work_id
      for (const image of imagesData) {
        // Check if the work_id exists in works table
        const workExists = worksData.some((work) => String(work.id) === String(image.work_id))

        if (!workExists) {
          console.log(`Image ${image.id} has invalid work_id: ${image.work_id}`)

          // Try to find a valid work to associate with
          if (worksData.length > 0) {
            const validWorkId = worksData[0].id

            // Update the work_id
            const { error: updateError } = await supabase
              .from("work_images")
              .update({ work_id: validWorkId })
              .eq("id", image.id)

            if (updateError) {
              console.error(`Error updating image ${image.id}:`, updateError)
            } else {
              fixCount++
            }
          }
        }
      }

      toast.success(`Fixed ${fixCount} work_images relationships`)
      checkDatabase() // Refresh data
    } catch (err: any) {
      console.error("Error fixing relationships:", err)
      toast.error(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function createSampleWorkImage() {
    try {
      setLoading(true)

      // Check if we have any works
      if (works.length === 0) {
        toast.error("No works available to associate images with")
        return
      }

      // Create a sample work image
      const workId = works[0].id
      const sampleImage = {
        work_id: workId,
        image_url: "https://via.placeholder.com/800x600",
        position: 0,
        transformations: {
          size: { width: 100, height: 100 },
          isFullWidth: false,
          spanRows: 1,
        },
      }

      const { data, error } = await supabase.from("work_images").insert(sampleImage).select()

      if (error) throw error

      toast.success("Sample work image created successfully")
      checkDatabase() // Refresh data
    } catch (err: any) {
      console.error("Error creating sample:", err)
      toast.error(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Checking database...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Database Check</h1>

        {error && (
          <div className="bg-red-900/50 border border-red-700 p-4 rounded-md mb-6">
            <h2 className="text-lg font-semibold text-red-400 mb-2">Error</h2>
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader>
              <CardTitle>Tables</CardTitle>
            </CardHeader>
            <CardContent>
              {tables.length > 0 ? (
                <ul className="space-y-2">
                  {tables.map((table, index) => (
                    <li key={index} className="flex items-center justify-between">
                      <span>{table.name}</span>
                      <span className={table.exists === false ? "text-red-500" : "text-green-500"}>
                        {table.exists === false ? "Missing" : "Available"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No tables found</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" onClick={checkDatabase} className="w-full">
                Refresh Database Info
              </Button>

              <Button variant="outline" onClick={createWorkImagesTable} className="w-full">
                Create work_images Table
              </Button>

              <Button variant="outline" onClick={fixWorkImagesRelationship} className="w-full">
                Fix work_images Relationships
              </Button>

              <Button variant="outline" onClick={createSampleWorkImage} className="w-full">
                Create Sample Work Image
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader>
              <CardTitle>Works Sample</CardTitle>
            </CardHeader>
            <CardContent>
              {works.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-2">ID</th>
                        <th className="text-left p-2">Title</th>
                        <th className="text-left p-2">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {works.map((work) => (
                        <tr key={work.id} className="border-b border-gray-800">
                          <td className="p-2">{work.id}</td>
                          <td className="p-2">{work.title}</td>
                          <td className="p-2">{new Date(work.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-400">No works found</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader>
              <CardTitle>Work Images Sample</CardTitle>
            </CardHeader>
            <CardContent>
              {workImages.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-2">ID</th>
                        <th className="text-left p-2">Work ID</th>
                        <th className="text-left p-2">Position</th>
                        <th className="text-left p-2">Image URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workImages.map((image) => (
                        <tr key={image.id} className="border-b border-gray-800">
                          <td className="p-2">{image.id}</td>
                          <td className="p-2">{image.work_id}</td>
                          <td className="p-2">{image.position}</td>
                          <td className="p-2 truncate max-w-[200px]">{image.image_url}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-400">No work images found</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
