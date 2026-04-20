import { createClient } from "./client";

export type BucketName = "brand-assets" | "design-requests" | "profiles" | "banners";

/**
 * Reusable utility for Supabase Storage operations
 */
export const storageService = {
    /**
     * Uploads a file to a specified bucket and path
     * @param file The file object to upload
     * @param bucket The bucket name
     * @param path The path within the bucket (e.g. "user-id/logo.png")
     */
    async uploadFile(file: File, bucket: BucketName, path: string) {
        const supabase = createClient();

        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, file, {
                upsert: true,
                contentType: file.type
            });

        if (error) {
            console.error(`Storage Upload Error [${bucket}]:`, error);
            throw error;
        }

        return data;
    },

    /**
     * Generates a signed URL for a private file
     * @param bucket The bucket name
     * @param path The file path
     * @param expiresIn Seconds until the link expires (default 1 hour)
     */
    async getDownloadUrl(bucket: BucketName, path: string, expiresIn = 3600) {
        const supabase = createClient();

        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresIn);

        if (error) {
            console.error(`Storage Download Error [${bucket}]:`, error);
            throw error;
        }

        return data.signedUrl;
    },

    /**
     * Deletes a file from storage
     */
    async deleteFile(bucket: BucketName, path: string) {
        const supabase = createClient();

        const { error } = await supabase.storage
            .from(bucket)
            .remove([path]);

        if (error) {
            console.error(`Storage Delete Error [${bucket}]:`, error);
            throw error;
        }

        return true;
    },

    /**
     * Helper to create a unique file path to prevent collisions
     */
    generatePath(userId: string, fileName: string) {
        const timestamp = Date.now();
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.]/g, "_");
        return `${userId}/${timestamp}_${sanitizedName}`;
    }
};
