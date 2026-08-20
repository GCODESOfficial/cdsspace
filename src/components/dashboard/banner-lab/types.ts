import type { BannerDimensionUnit } from "@/lib/banner-commerce";

export type Step = 1 | 2 | 3;

export type BannerFormData = {
    productId: string;
    isCustom: boolean;
    customWidth: number | string;
    customHeight: number | string;
    dimensionUnit: BannerDimensionUnit;
    quality: "Standard" | "Premium";
    size: string;
    environment: "Indoor" | "Outdoor";
    executionMode: "Upload" | "Create";
    designBrief: string;
    designContent: string;
    referenceNotes: string;
    assets: File[];
    assetUrls: string[];
    readyFiles: File[];
    readyFileUrls: string[];
    readyFile: File | null;
    readyFileUrl: string | null;
    draftId: string | null;
    discountCode: string;
    discountPercentage: number;
    quantity: number | string;
    fulfillmentType: "Door-to-door" | "Pickup Station";
    shipping: {
        countryId: string;
        country: string;
        state: string;
        city: string;
        streetAddress: string;
        recipientName: string;
        phoneNumber: string;
        instructions: string;
        pickupLocationId: string;
        pickupStation: string;
    };
    isSubmitting?: boolean;
};

export interface BannerLabProps {
    onBack: () => void;
    draftId?: string | null;
}
