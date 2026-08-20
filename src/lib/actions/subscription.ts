"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { verifyUser } from "@/lib/admin-auth";

const supabase = supabaseAdmin!;

interface SubscriptionData {
    plan: string;
    industry: string;
    companyName: string;
    brandBrief: string;
    fullName: string;
    email: string;
    phone: string;
    referralCode?: string;
    assets?: string;
    // New fields for the "First Brief" evolution
    firstRequestTitle?: string;
    firstRequestDesc?: string;
}


/**
 * Validates a referral code and returns the associated profile's full name if valid.
 */
export async function validateReferralCode(code: string) {
    if (!code || code.trim() === "") return { valid: false };

    try {
        const { data: referrer, error } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("referral_code", code.toUpperCase())
            .single();

        if (error || !referrer) {
            return { valid: false };
        }

        return { valid: true, referrerId: referrer.id, name: referrer.full_name };
    } catch (error) {
        console.error("Referral validation error:", error);
        return { valid: false };
    }
}

/**
 * Records a new subscription request in the database.
 * Updates the user's profile with their contact and company details.
 * (Note: In a real app, this would also interface with a payment provider)
 */
export async function recordSubscription(requestedUserId: string, data: SubscriptionData) {
    try {
        const session = await verifyUser();
        if (!session) return { success: false, error: "Unauthorized" };
        if (requestedUserId && requestedUserId !== session.user.id) {
            return { success: false, error: "This subscription does not belong to the active account." };
        }
        const userId = session.user.id;
        // Find the referrer if a code was provided
        let referrerId: string | undefined;
        if (data.referralCode) {
            const { data: referrer } = await supabase
                .from("profiles")
                .select("id")
                .eq("referral_code", data.referralCode.toUpperCase())
                .single();

            if (referrer) {
                referrerId = referrer.id;
            }
        }

        // 1. Update Profile
        const { error: profileError } = await supabase
            .from("profiles")
            .update({
                full_name: data.fullName,
                company_name: data.companyName,
                phone_number: data.phone,
            })
            .eq("id", userId);

        if (profileError) {
            console.error("Failed to update profile:", profileError);
            return { success: false, error: "Failed to update profile" };
        }

        // 2. Create Subscription
        const { error: subError } = await supabase
            .from("subscriptions")
            .insert({
                user_id: userId,
                plan: data.plan,
                industry: data.industry,
                company_name: data.companyName,
                brand_brief: data.brandBrief,
                referral_code: data.referralCode,
                referrer_id: referrerId,
                assets: data.assets,
            });

        if (subError) {
            console.error("Failed to create subscription:", subError);
            return { success: false, error: "Failed to create subscription" };
        }

        // 3. Optional: Create First Design Request (The "Evolution")
        if (data.firstRequestTitle && data.firstRequestDesc) {
            const { error: reqError } = await supabase
                .from("design_requests")
                .insert({
                    user_id: userId,
                    display_id: "REQ-001",
                    title: data.firstRequestTitle,
                    description: data.firstRequestDesc,
                    status: "PENDING",
                });

            if (reqError) {
                console.error("Failed to create design request:", reqError);
                // Non-fatal: subscription was already created
            }
        }

        // Revalidate relevant pages
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/subscription");

        return { success: true };
    } catch (error) {
        console.error("Failed to record subscription:", error);
        return { success: false, error: "Database operation failed" };
    }
}
