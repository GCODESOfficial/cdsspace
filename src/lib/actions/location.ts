"use server";

/**
 * Server Actions for fetching location data from CountriesNow API.
 * This ensures data is fetched on the server side as requested.
 */

const BASE_URL = "https://countriesnow.space/api/v0.1";

export interface Country {
    name: string;
    iso2: string;
}

export async function getCountries(): Promise<Country[]> {
    try {
        const response = await fetch(`${BASE_URL}/countries/iso`);
        const data = await response.json();
        if (data.error) throw new Error(data.msg);
        return data.data.map((c: any) => ({
            name: c.name,
            iso2: c.Iso2
        })).sort((a: any, b: any) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching countries:", error);
        return [];
    }
}

export async function getStates(country: string) {
    if (!country) return [];
    try {
        const response = await fetch(`${BASE_URL}/countries/states`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country }),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.msg);
        return data.data.states.map((s: any) => s.name).sort();
    } catch (error) {
        console.error("Error fetching states:", error);
        return [];
    }
}

export async function getCities(country: string, state: string) {
    if (!country || !state) return [];
    try {
        const response = await fetch(`${BASE_URL}/countries/state/cities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country, state }),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.msg);
        return data.data.sort();
    } catch (error) {
        console.error("Error fetching cities:", error);
        return [];
    }
}



