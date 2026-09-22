import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { chatComplete } from "@/lib/ai/openai";
import { normalizeMerchPrices } from "@/lib/merch-commerce";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 45;

type Product = { id: string; name: string; description: string | null; prices: Record<string, number> };

function fallbackAdvice(request: string, products: Product[]) {
  const words = request.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const ranked = products.map((product) => {
    const text = `${product.name} ${product.description || ""}`.toLowerCase();
    return { product, score: words.reduce((score, word) => score + (text.includes(word) ? 2 : 0), 0) };
  }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return {
    message: "A useful gift mix balances everyday value, presentation and the moment you want people to remember. These are the strongest starting points in the current catalogue.",
    suggestions: ranked.slice(0, 3).map(({ product }) => ({ id: product.id, name: product.name, reason: product.description || "A flexible option that can be customized for your recipients." })),
  };
}

export async function POST(req: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const request = String(body.message || "").replace(/\s+/g, " ").trim().slice(0, 800);
  if (!request) return NextResponse.json({ ok: false, error: "Tell us about the recipients or occasion." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("merch_products")
    .select("id,name,description,prices")
    .eq("active", true)
    .order("sort_order")
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: "The gift catalogue is temporarily unavailable." }, { status: 500 });
  const products = ((data || []) as Array<{ id: string; name: string; description: string | null; prices: unknown }>)
    .map((item) => ({ ...item, prices: normalizeMerchPrices(item.prices) })) as Product[];
  if (!products.length) return NextResponse.json({ ok: true, ...fallbackAdvice(request, products) });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: true, ...fallbackAdvice(request, products) });
  }

  try {
    const catalogue = products.map((item) => ({ id: item.id, name: item.name, description: item.description, prices: item.prices }));
    const result = await chatComplete([
      { role: "system", content: "You are the CDS Space cGifts advisor. Recommend only products in the supplied catalogue. Be concise, practical and professional. Return JSON with message and suggestions; each suggestion must contain id, name and reason. Return no more than three suggestions." },
      { role: "user", content: JSON.stringify({ request, catalogue }) },
    ], { temperature: 0.35, max_tokens: 650, response_format: { type: "json_object" }, user: session.user.id });
    const parsed = JSON.parse(result.text) as { message?: unknown; suggestions?: Array<{ id?: unknown; reason?: unknown }> };
    const byId = new Map(products.map((product) => [product.id, product]));
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).map((suggestion) => {
      const product = byId.get(String(suggestion.id || ""));
      return product ? { id: product.id, name: product.name, reason: String(suggestion.reason || product.description || "A strong fit for this brief.").slice(0, 240) } : null;
    }).filter(Boolean).slice(0, 3);
    if (!suggestions.length) return NextResponse.json({ ok: true, ...fallbackAdvice(request, products) });
    return NextResponse.json({ ok: true, message: String(parsed.message || "Here are the best matches from the current catalogue.").slice(0, 500), suggestions });
  } catch {
    return NextResponse.json({ ok: true, ...fallbackAdvice(request, products) });
  }
}
