"use client"

// Type definitions
export type Work = {
  id: string
  name: string
  description: string
  category: string
  imageUrl: string
  coverUrl: string
  createdAt: string
}

export type Brand = {
  id: string
  name: string
  order: number
  selected: boolean
}

export type Advertisement = {
  id: string
  imageUrl: string
  link: string
  createdAt: string
}

export type CarrierLink = {
  id: string
  url: string
  createdAt: string
}

export type SortOrder = "asc" | "desc"
export type SortBy = "date" | "name" | "category"

// Storage keys
const STORAGE_KEYS = {
  WORKS: "cds_works",
  BRANDS: "cds_brands",
  ADVERTISEMENTS: "cds_advertisements",
  CARRIER_LINK: "cds_carrier_link",
}

// Helper function to safely access localStorage (only in browser)
const getLocalStorage = () => {
  if (typeof window !== "undefined") {
    return window.localStorage
  }
  return null
}

// Generic get function
export function getItem<T>(key: string): T | null {
  const storage = getLocalStorage()
  if (!storage) return null

  try {
    const item = storage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch (error) {
    console.error(`Error getting item from storage: ${key}`, error)
    return null
  }
}

// Generic set function
export function setItem<T>(key: string, value: T): void {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error setting item in storage: ${key}`, error)
  }
}

// Works
export function getWorks(): Work[] {
  return getItem<Work[]>(STORAGE_KEYS.WORKS) || []
}

export function getWorkById(id: string): Work | undefined {
  const works = getWorks()
  return works.find((work) => work.id === id)
}

export function addWork(work: Omit<Work, "id" | "createdAt">): Work {
  const works = getWorks()
  const newWork: Work = {
    ...work,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }

  setItem(STORAGE_KEYS.WORKS, [...works, newWork])
  return newWork
}

export function updateWork(id: string, updatedWork: Partial<Omit<Work, "id" | "createdAt">>): Work | null {
  const works = getWorks()
  const workIndex = works.findIndex((w) => w.id === id)

  if (workIndex === -1) return null

  const updatedWorks = [...works]
  updatedWorks[workIndex] = {
    ...updatedWorks[workIndex],
    ...updatedWork,
  }

  setItem(STORAGE_KEYS.WORKS, updatedWorks)
  return updatedWorks[workIndex]
}

export function deleteWork(id: string): void {
  const works = getWorks()
  setItem(
    STORAGE_KEYS.WORKS,
    works.filter((w) => w.id !== id),
  )
}

export function searchWorks(query: string): Work[] {
  if (!query.trim()) return getWorks()

  const works = getWorks()
  const lowerQuery = query.toLowerCase()

  return works.filter(
    (work) =>
      work.name.toLowerCase().includes(lowerQuery) ||
      work.description.toLowerCase().includes(lowerQuery) ||
      work.category.toLowerCase().includes(lowerQuery),
  )
}

export function sortWorks(works: Work[], sortBy: SortBy, sortOrder: SortOrder): Work[] {
  const sortedWorks = [...works]

  switch (sortBy) {
    case "date":
      sortedWorks.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA
      })
      break
    case "name":
      sortedWorks.sort((a, b) => {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      })
      break
    case "category":
      sortedWorks.sort((a, b) => {
        return sortOrder === "asc" ? a.category.localeCompare(b.category) : b.category.localeCompare(a.category)
      })
      break
    default:
      // Default sort by date descending
      sortedWorks.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return dateB - dateA
      })
  }

  return sortedWorks
}

// Brands
export function getBrands(): Brand[] {
  const brands = getItem<Brand[]>(STORAGE_KEYS.BRANDS) || []
  return brands.sort((a, b) => a.order - b.order)
}

export function getSelectedBrands(): Brand[] {
  const brands = getBrands()
  return brands.filter((brand) => brand.selected)
}

export function addBrand(name: string): Brand {
  const brands = getBrands()
  const newBrand: Brand = {
    id: crypto.randomUUID(),
    name,
    order: brands.length,
    selected: false,
  }

  setItem(STORAGE_KEYS.BRANDS, [...brands, newBrand])
  return newBrand
}

export function deleteBrand(id: string): void {
  const brands = getBrands()
  setItem(
    STORAGE_KEYS.BRANDS,
    brands.filter((b) => b.id !== id),
  )
}

export function updateBrandSelection(id: string, selected: boolean): void {
  const brands = getBrands()
  const updatedBrands = brands.map((brand) => (brand.id === id ? { ...brand, selected } : brand))
  setItem(STORAGE_KEYS.BRANDS, updatedBrands)
}

export function updateBrandOrder(brandIds: string[]): void {
  const brands = getBrands()
  const updatedBrands = brands.map((brand) => ({
    ...brand,
    order: brandIds.indexOf(brand.id),
  }))
  setItem(STORAGE_KEYS.BRANDS, updatedBrands)
}

// Advertisements - Modified to only store one advertisement
export function getAdvertisement(): Advertisement | null {
  return getItem<Advertisement>(STORAGE_KEYS.ADVERTISEMENTS) || null
}

export function setAdvertisement(imageUrl: string, link: string): Advertisement {
  const newAd: Advertisement = {
    id: crypto.randomUUID(),
    imageUrl,
    link,
    createdAt: new Date().toISOString(),
  }

  setItem(STORAGE_KEYS.ADVERTISEMENTS, newAd)
  return newAd
}

export function deleteAdvertisement(): void {
  setItem(STORAGE_KEYS.ADVERTISEMENTS, null)
}

// Carrier Link
export function getCarrierLink(): CarrierLink | null {
  return getItem<CarrierLink>(STORAGE_KEYS.CARRIER_LINK)
}

export function updateCarrierLink(url: string): CarrierLink {
  const newLink: CarrierLink = {
    id: crypto.randomUUID(),
    url,
    createdAt: new Date().toISOString(),
  }

  setItem(STORAGE_KEYS.CARRIER_LINK, newLink)
  return newLink
}
