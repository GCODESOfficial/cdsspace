import type { Metadata } from "next";
import BrandIdentityPublicClient from "./BrandIdentityPublicClient";

type Params = Promise<{ token: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const title = "Brand Identity · CDS Space";
  const description = "A completed Brand Identity delivered by CDS Space.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "article", siteName: "CDS Space" },
  };
}

export default async function PublicBrandIdentityPage({ params }: { params: Params }) {
  const { token } = await params;
  return <BrandIdentityPublicClient token={token} />;
}
