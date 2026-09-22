import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateInvoiceNumber, generateQuotationNumber, randomToken } from "@/lib/finance/types";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { merchPrice, normalizeMerchPrices, type MerchProduct } from "@/lib/merch-commerce";
import { bannerPickupLocationLabel, bannerPrice, selectBannerDeliveryZone, type BannerDeliveryZone, type BannerPickupLocation } from "@/lib/banner-commerce";
import { normalizeInternationalPhoneNumber } from "@/lib/phone-number";
import { notifySuperAdmin } from "@/lib/notify-admin";
import { queueAdminAlert } from "@/lib/admin-alerts";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safePaths(value: unknown, userId: string) {
  const paths = Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
  return paths.every((path) => path.startsWith(`${userId}/merch/`) && !path.includes("..")) ? paths : null;
}

async function activeOffer(value: unknown) {
  const code = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
  if (!code) return null;
  const { data } = await supabaseAdmin.from("banner_discount_codes").select("code,percentage,starts_at,expires_at").eq("code", code).eq("active", true).maybeSingle();
  const now = Date.now();
  if (!data || (data.starts_at && new Date(data.starts_at).getTime() > now) || (data.expires_at && new Date(data.expires_at).getTime() <= now)) return null;
  return { code: data.code, percentage: Math.max(0, Math.min(100, Number(data.percentage) || 0)) };
}

async function activePickup(countryId: string, id: unknown) {
  if (!UUID.test(String(id || ""))) return null;
  const { data } = await supabaseAdmin.from("banner_pickup_locations").select("*").eq("id", String(id)).eq("country_id", countryId).eq("active", true).maybeSingle();
  return data as BannerPickupLocation | null;
}

export async function GET() {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: orders, error } = await supabaseAdmin.from("merch_orders").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const invoiceIds = (orders || []).map((order: any) => order.invoice_id).filter(Boolean);
  const productIds = (orders || []).map((order: any) => order.product_id).filter(Boolean);
  const [{ data: invoices }, { data: products }] = await Promise.all([
    invoiceIds.length ? supabaseAdmin.from("finance_invoices").select("id,invoice_number,public_token,status").in("id", invoiceIds) : Promise.resolve({ data: [] as any[] }),
    productIds.length ? supabaseAdmin.from("merch_products").select("id,name,presentation_image_path").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const invoiceById = new Map<string, any>((invoices || []).map((item: any) => [item.id, item]));
  const productById = new Map<string, any>((products || []).map((item: any) => [item.id, item]));
  const result = await Promise.all((orders || []).map(async (order: any) => {
    const product = productById.get(order.product_id);
    const { data: signed } = product?.presentation_image_path
      ? await (supabaseAdmin as any).storage.from("sales-commerce").createSignedUrl(product.presentation_image_path, 60 * 60)
      : { data: null };
    const invoice = order.invoice_id ? invoiceById.get(order.invoice_id) : null;
    return { ...order, presentation_image_url: signed?.signedUrl || null, invoice_number: invoice?.invoice_number || null, invoice_public_token: invoice?.public_token || null, invoice_status: invoice?.status || null };
  }));
  return NextResponse.json({ orders: result });
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!UUID.test(String(body.productId || ""))) return NextResponse.json({ error: "Choose a merch product." }, { status: 400 });
    const [{ data: profile }, { data: product, error: productError }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,email,full_name,company_name,billing_currency").eq("id", session.user.id).maybeSingle(),
      supabaseAdmin.from("merch_products").select("*").eq("id", body.productId).eq("active", true).maybeSingle(),
    ]);
    if (!profile) return NextResponse.json({ error: "Client profile not found." }, { status: 400 });
    if (productError || !product) return NextResponse.json({ error: "Choose an available merch product." }, { status: 400 });
    const typedProduct = { ...product, prices: normalizeMerchPrices(product.prices), design_prices: normalizeMerchPrices(product.design_prices) } as MerchProduct;
    const currency = normalizeClientBillingCurrency(profile.billing_currency) || "USD";
    const quantity = Math.max(1, Math.min(100000, Number(body.quantity) || 1));
    const custom = Boolean(product.is_custom);
    const executionMode = body.executionMode === "create" ? "create" : "upload";
    const samplePaths = safePaths(body.sampleFileUrls, session.user.id);
    const printPaths = safePaths(body.printFileUrls, session.user.id);
    if (!samplePaths || !printPaths) return NextResponse.json({ error: "One or more uploaded file paths are invalid." }, { status: 400 });
    if (custom && samplePaths.length === 0) return NextResponse.json({ error: "Upload a sample of the custom item you need." }, { status: 400 });
    if (executionMode === "upload" && printPaths.length === 0) return NextResponse.json({ error: "Upload the print or artwork you want applied to the merch." }, { status: 400 });
    if (executionMode === "create" && !String(body.designBrief || "").trim()) return NextResponse.json({ error: "Tell us what you want the merch design to communicate." }, { status: 400 });

    const { count } = await supabaseAdmin.from("merch_orders").select("*", { count: "exact", head: true }).eq("user_id", session.user.id);
    const displayId = `MRC-${String((count ?? 0) + 1).padStart(3, "0")}`;
    const title = String(body.title || "").trim() || `${product.name} order`;
    const shipping = body.shipping && typeof body.shipping === "object" ? body.shipping : {};
    const { data: country } = await supabaseAdmin.from("banner_countries").select("*").eq("id", shipping.countryId).eq("active", true).maybeSingle();
    if (!country) return NextResponse.json({ error: "Select an available delivery country." }, { status: 400 });
    const pickupMode = body.fulfillmentType === "Pickup Station";
    const pickup = pickupMode ? await activePickup(country.id, shipping.pickupLocationId) : null;
    if (pickupMode && !pickup) return NextResponse.json({ error: "Pickup is not available for this country. Choose direct delivery." }, { status: 400 });
    if (!String(shipping.recipientName || "").trim()) return NextResponse.json({ error: "Recipient name is required." }, { status: 400 });
    const phone = normalizeInternationalPhoneNumber(shipping.phoneNumber);
    if (!phone) return NextResponse.json({ error: "Enter a valid phone number with its country code." }, { status: 400 });
    if (!pickupMode && (!String(shipping.state || "").trim() || !String(shipping.city || "").trim() || !String(shipping.streetAddress || "").trim())) return NextResponse.json({ error: "Complete the delivery address." }, { status: 400 });

    const { data: zones } = await supabaseAdmin.from("banner_delivery_zones").select("*").eq("country_id", country.id).eq("active", true);
    const zone = selectBannerDeliveryZone((zones || []) as BannerDeliveryZone[], country.id, String(shipping.state || ""), String(shipping.city || ""));
    const deliverySource = zone || country;
    const fixedDelivery = !pickupMode && deliverySource.delivery_mode === "fixed" && bannerPrice(deliverySource.prices, currency) > 0;
    const deliveryFee = pickupMode ? 0 : fixedDelivery ? bannerPrice(deliverySource.prices, currency) : null;
    const deliveryMode = pickupMode ? "pickup" : fixedDelivery ? "fixed" : "quoted";
    const unitPrice = merchPrice(typedProduct.prices, currency);
    const designFee = executionMode === "create" ? merchPrice(typedProduct.design_prices, currency) : 0;
    const needsQuote = custom || unitPrice <= 0 || (executionMode === "create" && designFee <= 0);
    const pickupLabel = pickup ? bannerPickupLocationLabel(pickup) : "";
    const address = pickupMode ? pickupLabel : [shipping.streetAddress, shipping.city, shipping.state, country.country_name].filter(Boolean).join(", ");
    const clientName = profile.company_name || profile.full_name || profile.email;
    const baseOrder = {
      user_id: session.user.id, display_id: displayId, title, product_id: product.id, is_custom: custom,
      quantity, currency, execution_mode: executionMode, design_brief: String(body.designBrief || "") || null,
      reference_notes: String(body.referenceNotes || "") || null, sample_file_urls: samplePaths, print_file_urls: printPaths,
      fulfillment_type: pickupMode ? "Pickup Station" : "Door-to-door", pickup_location_id: pickup?.id || null,
      delivery_zone_id: zone?.id || null, country: country.country_name, state: shipping.state || null, city: shipping.city || null,
      street_address: shipping.streetAddress || null, recipient_name: shipping.recipientName, phone_number: phone,
      instructions: shipping.instructions || null, delivery_billing_mode: deliveryMode,
      product_snapshot: { id: product.id, code: product.code, name: product.name, unit_label: product.unit_label, is_custom: custom },
      details: { color: body.color || null, size: body.size || null, placement: body.placement || null, print_method: body.printMethod || null },
    };

    if (needsQuote) {
      const quotationNumber = generateQuotationNumber();
      const { data: quotation, error } = await supabaseAdmin.from("finance_quotations").insert({
        quotation_number: quotationNumber, user_id: session.user.id, project_name: title, client_name: clientName,
        client_email: profile.email, client_address: address, currency, subtotal: 0, tax_rate: 0, tax_amount: 0,
        discount: 0, total: 0, status: "draft", scope: "custom", issue_date: new Date().toISOString().slice(0, 10),
        valid_until: null, notes: `${displayId}\n${product.name}\nQuantity: ${quantity}\nArtwork: ${executionMode === "create" ? "CDS Space design requested" : "Client supplied"}`,
        estimate_note: "Pricing is pending a CDS Space review of the product, artwork, quantity and fulfilment requirements.",
        delivery_period: "3 business days", public_token: randomToken(28),
      }).select().single();
      if (error || !quotation) return NextResponse.json({ error: error?.message || "Could not create the quotation request." }, { status: 500 });
      await supabaseAdmin.from("finance_quotation_items").insert([
        { quotation_id: quotation.id, name: product.name, description: custom ? "Custom merch item supplied by client reference" : product.description, quantity, unit_price: 0, total: 0, position: 0 },
        ...(executionMode === "create" ? [{ quotation_id: quotation.id, name: "Merch design", description: "Design prepared from the supplied brief and references.", quantity: 1, unit_price: 0, total: 0, position: 1 }] : []),
      ]);
      const { data: order, error: orderError } = await supabaseAdmin.from("merch_orders").insert({ ...baseOrder, quotation_id: quotation.id, amount: 0, subtotal: 0, total: 0, status: "AWAITING_QUOTE", pricing_snapshot: { currency, pricing_status: "pending_review" } }).select().single();
      if (orderError) { await supabaseAdmin.from("finance_quotations").delete().eq("id", quotation.id); throw orderError; }
      await notifySuperAdmin({ type: "status_change", title: "Merch order needs pricing", message: `${quotationNumber} for ${clientName} is ready for review.`, link: `/admin/finance/quotations/${quotation.id}` });
      queueAdminAlert({
        kind: "order",
        subject: `${clientName}: ${product.name} (awaiting quote)`,
        details: [
          ["Order", displayId],
          ["Client", clientName],
          ["Email", profile.email],
          ["Product", product.name],
          ["Quantity", quantity],
          ["Artwork", executionMode === "create" ? "CDS Space design requested" : "Client supplied"],
          ["Quotation", quotationNumber],
          ["Status", "Awaiting pricing"],
        ],
        actionPath: `/admin/finance/quotations/${quotation.id}`,
        actionLabel: "Price this order",
        ...(profile.email ? { replyTo: profile.email } : {}),
      });
      if (UUID.test(String(body.draftId || ""))) await supabaseAdmin.from("merch_orders").delete().eq("id", body.draftId).eq("user_id", session.user.id).eq("status", "DRAFT");
      return NextResponse.json({ order, quotation: { id: quotation.id, quotation_number: quotationNumber, public_token: quotation.public_token } });
    }

    const offer = body.discountCode ? await activeOffer(body.discountCode) : null;
    if (body.discountCode && !offer) return NextResponse.json({ error: "This Special Offer Code is invalid or no longer available." }, { status: 400 });
    const productTotal = unitPrice * quantity;
    const subtotal = productTotal + designFee + (deliveryFee || 0);
    const discount = Math.round(subtotal * (offer?.percentage || 0)) / 100;
    const total = Math.max(0, subtotal - discount);
    const { data: invoice, error: invoiceError } = await supabaseAdmin.from("finance_invoices").insert({
      invoice_number: generateInvoiceNumber(), client_name: clientName, client_email: profile.email, client_address: address,
      user_id: session.user.id, currency, subtotal, tax_rate: 0, tax_amount: 0, discount, total, status: "sent",
      scope: "custom", issue_date: new Date().toISOString().slice(0, 10), due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes: `${displayId}\n${deliveryMode === "quoted" ? `Delivery to ${country.country_name} is not included and will be billed separately.` : "Delivery is included in this invoice."}`,
      delivery_speed: "standard", delivery_period: "3 business days", public_token: randomToken(28),
    }).select().single();
    if (invoiceError || !invoice) return NextResponse.json({ error: invoiceError?.message || "Could not create the invoice." }, { status: 500 });
    const items = [
      { invoice_id: invoice.id, name: product.name, description: product.description, quantity, unit_price: unitPrice, total: productTotal, position: 0 },
      ...(designFee > 0 ? [{ invoice_id: invoice.id, name: "Merch design", description: "Design from the supplied brief and references.", quantity: 1, unit_price: designFee, total: designFee, position: 1 }] : []),
      ...(deliveryFee && deliveryFee > 0 ? [{ invoice_id: invoice.id, name: "Delivery", description: zone?.name || country.country_name, quantity: 1, unit_price: deliveryFee, total: deliveryFee, position: 2 }] : []),
    ];
    const { error: itemsError } = await supabaseAdmin.from("finance_invoice_items").insert(items);
    if (itemsError) { await supabaseAdmin.from("finance_invoices").delete().eq("id", invoice.id); throw itemsError; }
    const { data: order, error: orderError } = await supabaseAdmin.from("merch_orders").insert({
      ...baseOrder, invoice_id: invoice.id, unit_price: unitPrice, design_fee: designFee, delivery_fee: deliveryFee,
      amount: total, subtotal, total, status: "AWAITING_PAYMENT",
      pricing_snapshot: { currency, unit_price: unitPrice, design_fee: designFee, delivery_fee: deliveryFee, offer },
    }).select().single();
    if (orderError) { await supabaseAdmin.from("finance_invoices").delete().eq("id", invoice.id); throw orderError; }
    await Promise.all([
      supabaseAdmin.from("notifications").insert({ user_id: session.user.id, type: "new_order", title: "Merch invoice ready", message: `${displayId} is ready for payment. Production becomes active as soon as payment is confirmed.`, link: "/dashboard/invoices", is_read: false }),
      notifySuperAdmin({ type: "status_change", title: "New merch order", message: `${displayId} from ${clientName} is awaiting payment.`, link: `/admin/orders/${order.id}` }),
    ]);
    queueAdminAlert({
      kind: "order",
      subject: `${clientName}: ${product.name}`,
      details: [
        ["Order", displayId],
        ["Client", clientName],
        ["Email", profile.email],
        ["Product", product.name],
        ["Quantity", quantity],
        ["Total", `${currency} ${total.toLocaleString()}`],
        ["Invoice", invoice.invoice_number],
        ["Status", "Awaiting payment"],
      ],
      actionPath: `/admin/orders/${order.id}`,
      actionLabel: "Open the order",
      ...(profile.email ? { replyTo: profile.email } : {}),
    });
    if (UUID.test(String(body.draftId || ""))) await supabaseAdmin.from("merch_orders").delete().eq("id", body.draftId).eq("user_id", session.user.id).eq("status", "DRAFT");
    return NextResponse.json({ order, invoice: { id: invoice.id, invoice_number: invoice.invoice_number, public_token: invoice.public_token } });
  } catch (error) {
    console.error("[merch] submission failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The merch request could not be submitted." }, { status: 500 });
  }
}
