import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sanitizeOrFilterTerm } from "@/lib/search-filter";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // Fetch design requests with profiles
    let designQuery = supabaseAdmin
      .from("design_requests")
      .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");

    if (status) {
      designQuery = designQuery.eq("status", status);
    }
    const safeSearch = sanitizeOrFilterTerm(search);
    if (safeSearch) {
      designQuery = designQuery.or(
        `title.ilike.%${safeSearch}%,profiles.full_name.ilike.%${safeSearch}%`
      );
    }

    const { data: designRequests, error: designError } = await designQuery.order("created_at", { ascending: false });

    if (designError) {
      throw designError;
    }

    // Fetch banner requests with profiles
    let bannerQuery = supabaseAdmin
      .from("banner_requests")
      .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");

    if (status) {
      bannerQuery = bannerQuery.eq("status", status);
    }
    if (search) {
      bannerQuery = bannerQuery.or(
        `title.ilike.%${search}%,profiles.full_name.ilike.%${search}%`
      );
    }

    const { data: bannerRequests, error: bannerError } = await bannerQuery.order("created_at", { ascending: false });

    if (bannerError) {
      throw bannerError;
    }

    // Fetch merch orders (if table exists)
    let merchOrders: any[] = [];
    try {
      let merchQuery = supabaseAdmin
        .from("merch_orders")
        .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");
      if (status) merchQuery = merchQuery.eq("status", status);
      if (safeSearch) merchQuery = merchQuery.or(`title.ilike.%${safeSearch}%,display_id.ilike.%${safeSearch}%`);
      const { data } = await merchQuery.order("created_at", { ascending: false });
      if (data) merchOrders = data;
    } catch {}

    // Fetch recurring design subscriptions (if table exists)
    let recurringOrders: any[] = [];
    try {
      let recurringQuery = supabaseAdmin
        .from("recurring_designs")
        .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");
      if (status) recurringQuery = recurringQuery.eq("status", status);
      const { data } = await recurringQuery.order("created_at", { ascending: false });
      if (data) recurringOrders = data;
    } catch {}

    // Supabase relationship embedding can legitimately return null when an
    // older order was created before the profile FK was present. Resolve the
    // account separately by user_id, with the linked invoice as a final banner
    // fallback, so a known client is never rendered as "Unknown".
    const sourceRows = [
      ...(designRequests ?? []),
      ...(bannerRequests ?? []),
      ...merchOrders,
      ...recurringOrders,
    ];
    const profileIds = Array.from(new Set(sourceRows.map((row: any) => row.user_id).filter(Boolean)));
    const invoiceIds = Array.from(new Set([...(bannerRequests ?? []), ...merchOrders].map((row: any) => row.invoice_id).filter(Boolean)));
    const [{ data: profileRows }, { data: invoiceRows }, { data: paymentSubmissionRows }] = await Promise.all([
      profileIds.length
        ? supabaseAdmin.from("profiles").select("id, email, full_name, company_name").in("id", profileIds)
        : Promise.resolve({ data: [] as any[] }),
      invoiceIds.length
        ? supabaseAdmin.from("finance_invoices").select("id, client_name, client_email").in("id", invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
      invoiceIds.length
        ? supabaseAdmin.from("invoice_payment_submissions").select("invoice_id, status, submitted_at").in("invoice_id", invoiceIds).eq("status", "pending")
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profileById = new Map((profileRows ?? []).map((profile: any) => [profile.id, profile]));
    const invoiceById = new Map<string, any>((invoiceRows ?? []).map((invoice: any) => [invoice.id, invoice]));
    const pendingPaymentByInvoice = new Map<string, any>((paymentSubmissionRows ?? []).map((submission: any) => [submission.invoice_id, submission]));

    function profileFor(row: any) {
      const embedded = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const profile = embedded || profileById.get(row.user_id) || null;
      const invoice = row.invoice_id ? invoiceById.get(row.invoice_id) : null;
      const fullName = profile?.company_name
        || profile?.full_name
        || invoice?.client_name
        || row.recipient_name
        || profile?.email
        || invoice?.client_email
        || null;
      const email = profile?.email || invoice?.client_email || null;
      return fullName ? { full_name: fullName, email: email || "" } : null;
    }

    // Combine all orders into a single sorted list
    const allOrders = [
      ...(designRequests ?? []).map((d: any) => ({
        id: d.id, displayId: `DS-${String(d.id).slice(0, 6).toUpperCase()}`,
        type: "design", title: d.title, status: d.status, created_at: d.created_at,
        profile: profileFor(d), invoiceId: d.invoice_id || null, paymentPendingValidation: Boolean(d.invoice_id && pendingPaymentByInvoice.has(d.invoice_id)), paymentSubmittedAt: pendingPaymentByInvoice.get(d.invoice_id)?.submitted_at || null,
      })),
      ...(bannerRequests ?? []).map((b: any) => ({
        id: b.id, displayId: `BN-${String(b.id).slice(0, 6).toUpperCase()}`,
        type: "banner", title: b.title, status: b.status, created_at: b.created_at,
        profile: profileFor(b), invoiceId: b.invoice_id || null, paymentPendingValidation: Boolean(b.invoice_id && pendingPaymentByInvoice.has(b.invoice_id)), paymentSubmittedAt: pendingPaymentByInvoice.get(b.invoice_id)?.submitted_at || null,
      })),
      ...merchOrders.map((m: any) => ({
        id: m.id, displayId: m.display_id || `MR-${String(m.id).slice(0, 6).toUpperCase()}`,
        type: "merch", title: m.title, status: m.status, created_at: m.created_at,
        profile: profileFor(m), invoiceId: m.invoice_id || null, paymentPendingValidation: Boolean(m.invoice_id && pendingPaymentByInvoice.has(m.invoice_id)), paymentSubmittedAt: pendingPaymentByInvoice.get(m.invoice_id)?.submitted_at || null,
      })),
      ...recurringOrders.map((r: any) => ({
        id: r.id, displayId: `RC-${String(r.id).slice(0, 6).toUpperCase()}`,
        type: "recurring", title: r.title, status: r.status, created_at: r.created_at,
        profile: profileFor(r), invoiceId: r.invoice_id || null, paymentPendingValidation: Boolean(r.invoice_id && pendingPaymentByInvoice.has(r.invoice_id)), paymentSubmittedAt: pendingPaymentByInvoice.get(r.invoice_id)?.submitted_at || null,
      })),
    ].sort((a, b) => Number(b.paymentPendingValidation) - Number(a.paymentPendingValidation) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply search filter
    const filteredOrders = search
      ? allOrders.filter(o => o.title?.toLowerCase().includes(search.toLowerCase()) || o.profile?.full_name?.toLowerCase().includes(search.toLowerCase()))
      : allOrders;

    return NextResponse.json({
      orders: filteredOrders,
      design_requests: designRequests ?? [],
      banner_requests: bannerRequests ?? [],
    });
  } catch (error) {
    console.error("Admin orders GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
