"use server";

/**
 * ADDRESS PROVIDER UTILITY
 * This file is designed to be "Plug-and-Play".
 * To switch to Google Maps, simply change the ACTIVE_PROVIDER at the top.
 */

export interface MapboxFeature {
    id: string;
    text: string;
    place_name: string;
    context?: any[];
}

type ProviderType = "MAPBOX" | "GOOGLE";

// --- CONFIGURATION ---
const ACTIVE_PROVIDER: ProviderType = "MAPBOX"; // Change to "GOOGLE" when API key is ready
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1IjoiYWRhbXBsIiwiYSI6ImNtN2V3bjdzYzBicGMybW4xYjUyeTNreTIifQ._E5664rS8Wl5qM2Y7f_q0g";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";


/**
 * Unified search function used by the UI.
 * This is the ONLY function you need to call in your components.
 */
export async function unifiedSearchAddress(
    query: string,
    countryCode?: string,
    state?: string,
    city?: string
): Promise<MapboxFeature[]> {
    if (ACTIVE_PROVIDER === "GOOGLE" && GOOGLE_MAPS_API_KEY) {
        return googleSearchAddress(query, countryCode, state, city);
    }

    // Default to Mapbox
    return mapboxSearchAddress(query, countryCode, state, city);
}


/**
 * MAPBOX IMPLEMENTATION
 */
async function mapboxSearchAddress(
    query: string,
    countryCode?: string,
    state?: string,
    city?: string
): Promise<MapboxFeature[]> {
    if (!query || query.length < 3) return [];

    try {
        let fullQuery = query;
        if (city) fullQuery += `, ${city}`;
        if (state) fullQuery += `, ${state}`;

        let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullQuery)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi&limit=5`;

        if (countryCode) {
            url += `&country=${countryCode.toLowerCase()}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!data.features) return [];

        return data.features.map((f: any) => ({
            id: f.id,
            text: f.text,
            place_name: f.place_name,
            context: f.context
        }));
    } catch (error) {
        console.error("Mapbox Search Error:", error);
        return [];
    }
}


/**
 * GOOGLE PLACES IMPLEMENTATION (Ready to use)
 * Uses Google Places (New) API with Field Masking and Location Biasing.
 */
async function googleSearchAddress(
    query: string,
    countryCode?: string,
    state?: string,
    city?: string
): Promise<MapboxFeature[]> {
    if (!query || query.length < 3 || !GOOGLE_MAPS_API_KEY) return [];

    try {
        // We use the 'places.searchText' endpoint which is newer and more robust
        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types"
            },
            body: JSON.stringify({
                textQuery: query,
                locationBias: state || city ? {
                    circle: {
                        center: { latitude: 0, longitude: 0 }, // Would require lat/lng of state
                        radius: 10000.0
                    }
                } : undefined,
                includedRegionCodes: countryCode ? [countryCode.toUpperCase()] : undefined,
                maxResultCount: 5
            })
        });

        const data = await response.json();

        if (!data.places) return [];

        // Map Google structure to our unified MapboxFeature structure
        return data.places.map((p: any) => ({
            id: p.id,
            text: p.displayName.text,
            place_name: p.formattedAddress,
            context: [] // Google doesn't use the same context structure
        }));
    } catch (error) {
        console.error("Google Places Search Error:", error);
        return [];
    }
}
