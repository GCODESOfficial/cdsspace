import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyUser } from "@/lib/admin-auth";
import { generateInvoiceNumber, generateQuotationNumber, randomToken } from "@/lib/finance/types";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { bannerMaterialPrice, bannerMaterialPrices, bannerPickupLocationLabel, bannerPrice, customBannerSizeLabel, normalizeBannerDimensionUnit, selectBannerDeliveryZone, type BannerDeliveryZone, type BannerMaterial, type BannerPickupLocation, type BannerProduct } from "@/lib/banner-commerce";
import { notifySuperAdmin } from "@/lib/notify-admin";
import { normalizeInternationalPhoneNumber } from "@/lib/phone-number";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDiscountCode(value: unknown) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

async function activeBannerDiscount(code: string) {
    if (!code) return null;
    const { data, error } = await supabaseAdmin!
        .from("banner_discount_codes")
        .select("id, code, percentage, starts_at, expires_at")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle();
    if (error) throw error;
    const now = Date.now();
    if (!data || (data.starts_at && new Date(data.starts_at).getTime() > now) || (data.expires_at && new Date(data.expires_at).getTime() <= now)) return null;
    return { ...data, percentage: Math.max(0, Math.min(100, Number(data.percentage) || 0)) };
}

async function activePickupLocation(countryId: string, locationId: unknown) {
    if (!UUID_PATTERN.test(String(locationId || ""))) return null;
    const { data, error } = await supabaseAdmin!
        .from("banner_pickup_locations")
        .select("id, country_id, name, address_line, region, city, instructions, active, sort_order")
        .eq("id", String(locationId))
        .eq("country_id", countryId)
        .eq("active", true)
        .maybeSingle();
    if (error) throw error;
    return data as BannerPickupLocation | null;
}

export async function GET() {
    try {
        const session = await verifyUser();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { user } = session;

        const { data: banners, error: fetchError } = await supabaseAdmin!
            .from("banner_requests")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (fetchError) {
            console.error("Supabase fetch error:", fetchError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        const invoiceIds = (banners || []).map((banner: Record<string, any>) => banner.invoice_id).filter(Boolean);
        const { data: linkedInvoices } = invoiceIds.length
            ? await supabaseAdmin!
                .from("finance_invoices")
                .select("id, invoice_number, public_token, status")
                .in("id", invoiceIds)
            : { data: [] };
        const invoiceById = new Map<string, Record<string, any>>((linkedInvoices || []).map((invoice: Record<string, any>) => [invoice.id, invoice]));

        const bannersWithArtwork = (banners || []).map((banner: Record<string, any>) => {
            const linkedInvoice = banner.invoice_id ? invoiceById.get(banner.invoice_id) : null;
            const paths = Array.isArray(banner.ready_file_urls) ? banner.ready_file_urls : banner.ready_file_url ? [banner.ready_file_url] : [];
            const firstPath = typeof paths[0] === "string" ? paths[0] : null;
            const extension = firstPath?.split(".").pop()?.toLowerCase() || "";
            const previewable = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension);
            const artworkPreviewUrl = firstPath && previewable
                ? `/api/banners/${banner.id}/artwork?v=${encodeURIComponent(String(banner.updated_at || ""))}`
                : null;
            return {
                ...banner,
                artwork_preview_url: artworkPreviewUrl,
                invoice_number: linkedInvoice?.invoice_number || null,
                invoice_public_token: linkedInvoice?.public_token || null,
                invoice_status: linkedInvoice?.status || null,
            };
        });
        return NextResponse.json({ banners: bannersWithArtwork });
    } catch (error) {
        console.error("API Error [banners GET]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await verifyUser();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { user } = session;

        const body = await request.json();
        const {
            productId, isCustom, customWidth, customHeight, dimensionUnit, quality, environment, executionMode, designBrief, designContent, referenceNotes, assetUrls, readyFileUrl, readyFileUrls, draftId, discountCode,
            quantity, fulfillmentType, shipping, status,
        } = body;

        const requestedQuantity = Math.max(1, Math.min(1000, Number(quantity) || 1));
        const isDraft = status === "DRAFT";
        const submittedReadyFileUrls = (Array.isArray(readyFileUrls) ? readyFileUrls : (typeof readyFileUrl === "string" && readyFileUrl ? [readyFileUrl] : []))
            .map((value) => String(value || "").trim()).filter(Boolean);
        if (submittedReadyFileUrls.some((path) => !path.startsWith(`${user.id}/`) || path.includes(".."))) {
            return NextResponse.json({ error: "One or more uploaded artwork paths are invalid." }, { status: 400 });
        }
        const { data: profile, error: profileError } = await supabaseAdmin!
            .from("profiles")
            .select("id, email, full_name, company_name, phone_number, billing_currency")
            .eq("id", user.id)
            .maybeSingle();
        if (profileError || !profile) return NextResponse.json({ error: "Client profile not found." }, { status: 400 });

        const currency = normalizeClientBillingCurrency(profile.billing_currency) || "USD";
        const material: BannerMaterial = quality === "Premium" ? "Premium" : "Standard";
        const normalizedDiscountCode = normalizeDiscountCode(discountCode);
        const discount = !isDraft && isCustom !== true && normalizedDiscountCode ? await activeBannerDiscount(normalizedDiscountCode) : null;
        if (!isDraft && isCustom !== true && normalizedDiscountCode && !discount) {
            return NextResponse.json({ error: "This Special Offer Code is invalid or no longer available." }, { status: 400 });
        }

        // Generate sequential display ID (BNR-001, BNR-002, etc.)
        const { count, error: countError } = await supabaseAdmin!
            .from("banner_requests")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);

        if (countError) {
            console.error("Supabase count error:", countError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        const displayId = `BNR-${String((count ?? 0) + 1).padStart(3, "0")}`;
        const customUnit = normalizeBannerDimensionUnit(dimensionUnit);
        const requestedCustomWidth = Math.max(0, Number(customWidth) || 0);
        const requestedCustomHeight = Math.max(0, Number(customHeight) || 0);

        if (isCustom === true) {
            if (requestedCustomWidth <= 0 || requestedCustomHeight <= 0 || requestedCustomWidth > 100000 || requestedCustomHeight > 100000) {
                return NextResponse.json({ error: "Enter valid custom banner width and height." }, { status: 400 });
            }
            const customSize = customBannerSizeLabel(requestedCustomWidth, requestedCustomHeight, customUnit);
            if (isDraft) {
                const { data: draft, error: draftError } = await supabaseAdmin!
                    .from("banner_requests")
                    .insert({
                        user_id: user.id,
                        display_id: displayId,
                        title: `Custom banner · ${customSize}`,
                        product_id: null,
                        is_custom: true,
                        custom_width: requestedCustomWidth,
                        custom_height: requestedCustomHeight,
                        dimension_unit: customUnit,
                        size: customSize,
                        quality: material,
                        environment: environment === "Outdoor" ? "Outdoor" : "Indoor",
                        execution_mode: executionMode === "Upload" ? "Upload" : "Create",
                        design_brief: designBrief || null,
                        design_content: designContent || null,
                        reference_notes: referenceNotes || null,
                        asset_urls: Array.isArray(assetUrls) ? assetUrls : [],
                        ready_file_url: submittedReadyFileUrls[0] || null,
                        ready_file_urls: submittedReadyFileUrls,
                        quantity: requestedQuantity,
                        fulfillment_type: fulfillmentType || "Door-to-door",
                        country: shipping?.country || null,
                        state: shipping?.state || null,
                        city: shipping?.city || null,
                        street_address: shipping?.streetAddress || null,
                        recipient_name: shipping?.recipientName || null,
                        phone_number: shipping?.phoneNumber || null,
                        instructions: shipping?.instructions || null,
                        pickup_station: shipping?.pickupStation || null,
                        currency,
                        status: "DRAFT",
                    })
                    .select()
                    .single();
                if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });
                return NextResponse.json({ banner: draft });
            }

            if (executionMode === "Upload" && submittedReadyFileUrls.length !== requestedQuantity) {
                return NextResponse.json({ error: `Upload exactly ${requestedQuantity} print-ready design${requestedQuantity === 1 ? "" : "s"}, one for each banner.` }, { status: 400 });
            }
            if (executionMode !== "Upload" && (!String(designBrief || "").trim() || !String(designContent || "").trim())) {
                return NextResponse.json({ error: "Add the design brief and the exact content to include." }, { status: 400 });
            }
            if (!shipping?.recipientName?.trim()) return NextResponse.json({ error: "Recipient name is required." }, { status: 400 });
            const recipientPhone = normalizeInternationalPhoneNumber(shipping?.phoneNumber);
            if (!recipientPhone) return NextResponse.json({ error: "Enter a valid phone number with the correct country code." }, { status: 400 });
            const pickup = fulfillmentType === "Pickup Station";
            if (!pickup && (!shipping?.state?.trim() || !shipping?.city?.trim() || !shipping?.streetAddress?.trim())) {
                return NextResponse.json({ error: "Complete the delivery address." }, { status: 400 });
            }
            const { data: country, error: countryError } = await supabaseAdmin!
                .from("banner_countries")
                .select("id, country_name")
                .eq("id", shipping?.countryId)
                .eq("active", true)
                .maybeSingle();
            if (countryError || !country) return NextResponse.json({ error: "Select an available delivery country." }, { status: 400 });
            const pickupLocation = pickup ? await activePickupLocation(country.id, shipping?.pickupLocationId) : null;
            if (pickup && !pickupLocation) {
                return NextResponse.json({ error: "Pickup is not available for this country. Choose direct courier delivery." }, { status: 400 });
            }
            const pickupLabel = pickupLocation ? bannerPickupLocationLabel(pickupLocation) : "";

            const quotationNumber = generateQuotationNumber();
            const clientName = profile.company_name || profile.full_name || profile.email;
            const deliveryAddress = pickup
                ? pickupLabel
                : [shipping?.streetAddress, shipping?.city, shipping?.state, country.country_name].filter(Boolean).join(", ");
            const quoteNotes = [
                `Custom banner request ${displayId}`,
                `Dimensions: ${customSize}`,
                `Material: ${material}`,
                `Environment: ${environment === "Outdoor" ? "Outdoor" : "Indoor"}`,
                `Artwork: ${executionMode === "Upload" ? "Client-supplied print-ready artwork" : "New design requested from CDS Space"}`,
                `Fulfilment: ${pickup ? "Pickup station" : "Door-to-door delivery"}`,
                referenceNotes ? `References: ${String(referenceNotes).trim()}` : null,
            ].filter(Boolean).join("\n");

            const { data: quotation, error: quotationError } = await supabaseAdmin!
                .from("finance_quotations")
                .insert({
                    quotation_number: quotationNumber,
                    user_id: user.id,
                    project_name: `Custom banner · ${customSize}`,
                    client_name: clientName,
                    client_email: profile.email,
                    client_address: deliveryAddress,
                    currency,
                    subtotal: 0,
                    tax_rate: 0,
                    tax_amount: 0,
                    discount: 0,
                    total: 0,
                    status: "draft",
                    scope: "custom",
                    issue_date: new Date().toISOString().slice(0, 10),
                    valid_until: null,
                    notes: quoteNotes,
                    estimate_note: "Pricing is pending a CDS Space review of the custom dimensions, material, artwork and delivery requirements.",
                    delivery_period: "3 business days",
                    public_token: randomToken(28),
                })
                .select()
                .single();
            if (quotationError || !quotation) return NextResponse.json({ error: quotationError?.message || "Could not create the quotation request." }, { status: 500 });

            const quotationItems = [
                {
                    quotation_id: quotation.id,
                    name: "Custom banner production",
                    description: `${customSize} · ${material} material · ${environment === "Outdoor" ? "Outdoor" : "Indoor"}`,
                    quantity: requestedQuantity,
                    unit_price: 0,
                    total: 0,
                    position: 0,
                },
                ...(executionMode !== "Upload" ? [{
                    quotation_id: quotation.id,
                    name: "Custom banner design",
                    description: "Create a print-ready design from the supplied brief, content, assets and references.",
                    quantity: 1,
                    unit_price: 0,
                    total: 0,
                    position: 1,
                }] : []),
                ...(!pickup ? [{
                    quotation_id: quotation.id,
                    name: "Delivery and logistics",
                    description: deliveryAddress,
                    quantity: 1,
                    unit_price: 0,
                    total: 0,
                    position: executionMode !== "Upload" ? 2 : 1,
                }] : []),
            ];
            const { error: itemError } = await supabaseAdmin!.from("finance_quotation_items").insert(quotationItems);
            if (itemError) {
                await supabaseAdmin!.from("finance_quotations").delete().eq("id", quotation.id);
                return NextResponse.json({ error: itemError.message }, { status: 500 });
            }

            const { data: newBanner, error: insertError } = await supabaseAdmin!
                .from("banner_requests")
                .insert({
                    user_id: user.id,
                    display_id: displayId,
                    title: `Custom banner · ${customSize}`,
                    product_id: null,
                    quotation_id: quotation.id,
                    is_custom: true,
                    custom_width: requestedCustomWidth,
                    custom_height: requestedCustomHeight,
                    dimension_unit: customUnit,
                    size: customSize,
                    quality: material,
                    environment: environment === "Outdoor" ? "Outdoor" : "Indoor",
                    execution_mode: executionMode === "Upload" ? "Upload" : "Create",
                    design_brief: designBrief || null,
                    design_content: designContent || null,
                    reference_notes: referenceNotes || null,
                    asset_urls: Array.isArray(assetUrls) ? assetUrls : [],
                    ready_file_url: submittedReadyFileUrls[0] || null,
                    ready_file_urls: submittedReadyFileUrls,
                    quantity: requestedQuantity,
                    fulfillment_type: fulfillmentType || "Door-to-door",
                    pickup_location_id: pickupLocation?.id || null,
                    country: country.country_name,
                    state: shipping?.state || null,
                    city: shipping?.city || null,
                    street_address: shipping?.streetAddress || null,
                    recipient_name: shipping?.recipientName || null,
                    phone_number: recipientPhone,
                    instructions: shipping?.instructions || null,
                    pickup_station: pickupLabel || null,
                    currency,
                    production_unit_price: null,
                    design_fee: null,
                    delivery_fee: null,
                    subtotal: 0,
                    total: 0,
                    delivery_billing_mode: pickup ? "pickup" : "quoted",
                    pricing_snapshot: { currency, custom: true, size: customSize, material, pricing_status: "pending_review", pickupLocation },
                    status: "AWAITING_QUOTE",
                })
                .select()
                .single();
            if (insertError) {
                await supabaseAdmin!.from("finance_quotations").delete().eq("id", quotation.id);
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }

            await Promise.all([
                supabaseAdmin!.from("notifications").insert({
                    user_id: user.id,
                    type: "new_order",
                    title: "Custom banner quotation requested",
                    message: `${displayId} was submitted without a price. CDS Space will review it and send the completed invoice to your account.`,
                    link: "/dashboard/orders",
                    is_read: false,
                }),
                notifySuperAdmin({
                    type: "status_change",
                    title: "Custom banner needs pricing",
                    message: `${quotationNumber} for ${clientName} is ready for production, design and delivery pricing.`,
                    link: `/admin/finance/quotations/${quotation.id}`,
                }),
            ]);

            if (typeof draftId === "string" && UUID_PATTERN.test(draftId)) {
                await supabaseAdmin!.from("banner_requests").delete().eq("id", draftId).eq("user_id", user.id).eq("status", "DRAFT");
            }

            return NextResponse.json({
                banner: newBanner,
                quotation: { id: quotation.id, quotation_number: quotation.quotation_number, status: quotation.status },
            });
        }

        const { data: product, error: productError } = await supabaseAdmin!
            .from("banner_products")
            .select("*")
            .eq("id", productId)
            .eq("active", true)
            .maybeSingle();
        if (productError || !product) return NextResponse.json({ error: "Select an available banner size." }, { status: 400 });
        const pricedProduct = product as BannerProduct;
        const size = `${Number(product.width_cm)}x${Number(product.height_cm)}`;

        if (isDraft) {
            const { data: draft, error: draftError } = await supabaseAdmin!
                .from("banner_requests")
                .insert({
                    user_id: user.id,
                    display_id: displayId,
                    title: product.name,
                    product_id: product.id,
                    size,
                    quality: material,
                    environment: product.environment,
                    execution_mode: executionMode === "Upload" ? "Upload" : "Create",
                    design_brief: designBrief || null,
                    design_content: designContent || null,
                    reference_notes: referenceNotes || null,
                    asset_urls: Array.isArray(assetUrls) ? assetUrls : [],
                    ready_file_url: submittedReadyFileUrls[0] || null,
                    ready_file_urls: submittedReadyFileUrls,
                    quantity: requestedQuantity,
                    fulfillment_type: fulfillmentType || "Door-to-door",
                    country: shipping?.country || null,
                    state: shipping?.state || null,
                    city: shipping?.city || null,
                    street_address: shipping?.streetAddress || null,
                    recipient_name: shipping?.recipientName || null,
                    phone_number: shipping?.phoneNumber || null,
                    instructions: shipping?.instructions || null,
                    pickup_station: shipping?.pickupStation || null,
                    currency,
                    status: "DRAFT",
                })
                .select()
                .single();
            if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });
            return NextResponse.json({ banner: draft });
        }

        const productionUnitPrice = bannerMaterialPrice(pricedProduct, material, currency);
        if (productionUnitPrice <= 0) {
            return NextResponse.json({ error: `${currency} pricing is not available for this banner size yet.` }, { status: 409 });
        }

        let designService = null;
        let designFee = 0;
        if (executionMode !== "Upload") {
            const { data, error } = await supabaseAdmin!
                .from("banner_design_services")
                .select("*")
                .eq("code", "banner-new-design")
                .eq("active", true)
                .maybeSingle();
            if (error || !data) return NextResponse.json({ error: "The new-design service is not currently available." }, { status: 409 });
            designService = data;
            designFee = bannerPrice(data.prices, currency);
            if (designFee <= 0) return NextResponse.json({ error: `${currency} pricing is not available for the design service yet.` }, { status: 409 });
            if (!String(designBrief || "").trim() || !String(designContent || "").trim()) return NextResponse.json({ error: "Add the design brief and the exact content to include." }, { status: 400 });
        }

        if (executionMode === "Upload" && submittedReadyFileUrls.length !== requestedQuantity) {
            return NextResponse.json({ error: `Upload exactly ${requestedQuantity} print-ready design${requestedQuantity === 1 ? "" : "s"}, one for each banner.` }, { status: 400 });
        }

        const { data: country, error: countryError } = await supabaseAdmin!
            .from("banner_countries")
            .select("*")
            .eq("id", shipping?.countryId)
            .eq("active", true)
            .maybeSingle();
        if (countryError || !country) return NextResponse.json({ error: "Select an available delivery country." }, { status: 400 });

        const { data: zones, error: zoneError } = await supabaseAdmin!
            .from("banner_delivery_zones")
            .select("*")
            .eq("country_id", country.id)
            .eq("active", true);
        if (zoneError) return NextResponse.json({ error: zoneError.message }, { status: 500 });
        const matchedZone = selectBannerDeliveryZone((zones || []) as BannerDeliveryZone[], country.id, shipping?.state || "", shipping?.city || "");
        const pickup = fulfillmentType === "Pickup Station";
        const pickupLocation = pickup ? await activePickupLocation(country.id, shipping?.pickupLocationId) : null;
        if (pickup && !pickupLocation) {
            return NextResponse.json({ error: "Pickup is not available for this country. Choose direct courier delivery." }, { status: 400 });
        }
        const pickupLabel = pickupLocation ? bannerPickupLocationLabel(pickupLocation) : "";
        const deliverySource = matchedZone || country;
        const configuredDelivery = bannerPrice(deliverySource.prices, currency);
        const deliveryIsFixed = !pickup && deliverySource.delivery_mode === "fixed" && configuredDelivery > 0;
        const deliveryFee = pickup ? 0 : deliveryIsFixed ? configuredDelivery : null;
        const deliveryBillingMode = pickup ? "pickup" : deliveryIsFixed ? "fixed" : "quoted";

        if (!shipping?.recipientName?.trim()) return NextResponse.json({ error: "Recipient name is required." }, { status: 400 });
        const recipientPhone = normalizeInternationalPhoneNumber(shipping?.phoneNumber);
        if (!recipientPhone) return NextResponse.json({ error: "Enter a valid phone number with the correct country code." }, { status: 400 });
        if (!pickup && (!shipping?.state?.trim() || !shipping?.city?.trim() || !shipping?.streetAddress?.trim())) {
            return NextResponse.json({ error: "Complete the delivery address." }, { status: 400 });
        }

        const productionTotal = productionUnitPrice * requestedQuantity;
        const productionAndDesign = productionTotal + designFee;
        const subtotal = productionAndDesign + (deliveryFee || 0);
        const discountAmount = Math.round((subtotal * (discount?.percentage || 0) / 100) * 100) / 100;
        const total = Math.max(0, subtotal - discountAmount);
        const deliveryNote = deliveryBillingMode === "quoted"
            ? `Delivery to ${country.country_name} is not included in this invoice and will be billed separately after the exact destination and logistics cost are confirmed.`
            : deliveryBillingMode === "pickup"
                ? `This order is scheduled for pickup at ${pickupLabel}; no door-to-door delivery fee is included.`
                : `Delivery is included for ${matchedZone?.name || country.country_name}.`;

        const invoicePayload = {
            invoice_number: generateInvoiceNumber(),
            client_name: profile.company_name || profile.full_name || profile.email,
            client_email: profile.email,
            client_address: pickup
                ? pickupLabel
                : [shipping?.streetAddress, shipping?.city, shipping?.state, country.country_name].filter(Boolean).join(", "),
            user_id: user.id,
            currency,
            subtotal,
            tax_rate: 0,
            tax_amount: 0,
            discount: discountAmount,
            total,
            status: "sent",
            scope: "custom",
            issue_date: new Date().toISOString().slice(0, 10),
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            notes: `Banner order ${displayId}\n${deliveryNote}${discount ? `\nSpecial Offer Code ${discount.code}: ${discount.percentage}%` : ""}`,
            delivery_speed: "standard",
            delivery_period: "3 business days",
            public_token: randomToken(28),
        };
        const { data: invoice, error: invoiceError } = await supabaseAdmin!
            .from("finance_invoices")
            .insert(invoicePayload)
            .select()
            .single();
        if (invoiceError || !invoice) return NextResponse.json({ error: invoiceError?.message || "Could not create invoice." }, { status: 500 });

        const invoiceItems = [
            {
                invoice_id: invoice.id,
                name: product.name,
                description: `${Number(product.width_cm)}cm × ${Number(product.height_cm)}cm · ${material} material · ${product.environment}`,
                quantity: requestedQuantity,
                unit_price: productionUnitPrice,
                total: productionTotal,
                position: 0,
            },
            ...(designFee > 0 ? [{
                invoice_id: invoice.id,
                name: designService?.name || "Create a new banner design",
                description: "Design from the supplied brief, content, brand elements and references.",
                quantity: 1,
                unit_price: designFee,
                total: designFee,
                position: 1,
            }] : []),
            ...(deliveryFee !== null && deliveryFee > 0 ? [{
                invoice_id: invoice.id,
                name: "Banner delivery",
                description: matchedZone?.name || country.country_name,
                quantity: 1,
                unit_price: deliveryFee,
                total: deliveryFee,
                position: 2,
            }] : []),
        ];
        const { error: itemError } = await supabaseAdmin!.from("finance_invoice_items").insert(invoiceItems);
        if (itemError) {
            await supabaseAdmin!.from("finance_invoices").delete().eq("id", invoice.id);
            return NextResponse.json({ error: itemError.message }, { status: 500 });
        }

        const { data: newBanner, error: insertError } = await supabaseAdmin!
            .from("banner_requests")
            .insert({
                user_id: user.id,
                display_id: displayId,
                title: product.name,
                product_id: product.id,
                delivery_zone_id: matchedZone?.id || null,
                pickup_location_id: pickupLocation?.id || null,
                invoice_id: invoice.id,
                size,
                quality: material,
                environment: product.environment,
                execution_mode: executionMode || "Create",
                design_brief: designBrief || null,
                design_content: designContent || null,
                reference_notes: referenceNotes || null,
                asset_urls: Array.isArray(assetUrls) ? assetUrls : [],
                ready_file_url: submittedReadyFileUrls[0] || null,
                ready_file_urls: submittedReadyFileUrls,
                quantity: requestedQuantity,
                fulfillment_type: fulfillmentType || "Door-to-door",
                country: country.country_name,
                state: shipping?.state || null,
                city: shipping?.city || null,
                street_address: shipping?.streetAddress || null,
                recipient_name: shipping?.recipientName || null,
                phone_number: recipientPhone,
                instructions: shipping?.instructions || null,
                pickup_station: pickupLabel || null,
                currency,
                production_unit_price: productionUnitPrice,
                design_fee: designFee,
                delivery_fee: deliveryFee,
                subtotal,
                total,
                discount_code: discount?.code || null,
                discount_percentage: discount?.percentage || 0,
                discount_amount: discountAmount,
                delivery_billing_mode: deliveryBillingMode,
                pricing_snapshot: {
                    currency,
                    product: { id: product.id, code: product.code, name: product.name, material, prices: bannerMaterialPrices(pricedProduct, material) },
                    designService: designService ? { id: designService.id, code: designService.code, name: designService.name, prices: designService.prices } : null,
                    country: { id: country.id, code: country.country_code, name: country.country_name, delivery_mode: country.delivery_mode, prices: country.prices },
                    deliveryZone: matchedZone,
                    pickupLocation,
                    discount: discount ? { code: discount.code, percentage: discount.percentage, amount: discountAmount } : null,
                },
                status: "AWAITING_PAYMENT",
            })
            .select()
            .single();

        if (insertError) {
            console.error("Supabase insert error:", insertError);
            await supabaseAdmin!.from("finance_invoices").delete().eq("id", invoice.id);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        await supabaseAdmin!.from("notifications").insert({
            user_id: user.id,
            type: "new_order",
            title: "Banner invoice ready",
            message: `${displayId} was submitted and invoice ${invoice.invoice_number} is ready. Production will enter the pending queue after payment is confirmed.`,
            link: "/dashboard/invoices",
            is_read: false,
        });

        if (typeof draftId === "string" && UUID_PATTERN.test(draftId)) {
            await supabaseAdmin!.from("banner_requests").delete().eq("id", draftId).eq("user_id", user.id).eq("status", "DRAFT");
        }

        return NextResponse.json({ banner: newBanner, invoice: { id: invoice.id, public_token: invoice.public_token, invoice_number: invoice.invoice_number } });
    } catch (error) {
        console.error("API Error [banners POST]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await verifyUser();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { user } = session;

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing Banner ID" }, { status: 400 });
        }

        const { data: updatedBanner, error: updateError } = await supabaseAdmin!
            .from("banner_requests")
            .update(updates)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .single();

        if (updateError) {
            console.error("Supabase update error:", updateError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ banner: updatedBanner });
    } catch (error) {
        console.error("API Error [banners PATCH]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await verifyUser();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { user } = session;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Missing ID" }, { status: 400 });
        }

        const { data: deletedBanner, error: deleteError } = await supabaseAdmin!
            .from("banner_requests")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id)
            .eq("status", "DRAFT")
            .select("id")
            .maybeSingle();

        if (deleteError) {
            console.error("Supabase delete error:", deleteError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        if (!deletedBanner) {
            return NextResponse.json({ error: "Only saved drafts can be deleted." }, { status: 409 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("API Error [banners DELETE]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
