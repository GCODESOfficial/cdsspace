export type Step = 1 | 2 | 3;

export type BannerFormData = {
    quality: "Standard" | "Premium";
    size: string;
    environment: "Indoor" | "Outdoor";
    executionMode: "Upload" | "Create";
    designBrief: string;
    assets: File[];
    assetUrls: string[];
    readyFile: File | null;
    readyFileUrl: string | null;
    quantity: number | string;
    fulfillmentType: "Door-to-door" | "Pickup Station";
    shipping: {
        country: string;
        state: string;
        city: string;
        streetAddress: string;
        recipientName: string;
        phoneNumber: string;
        instructions: string;
        pickupStation: string;
    };
    isSubmitting?: boolean;
};

export interface BannerLabProps {
    onBack: () => void;
}
