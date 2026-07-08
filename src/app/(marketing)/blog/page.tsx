import type { Metadata } from "next";
import BlogLanding from "./BlogLanding";

export const metadata: Metadata = {
  title: "Blog - CDS Space | Brand Intelligence for Builders",
  description: "Thoughts, case studies, audits, and insights from CDS Space on branding, business growth, AI, Web3, design, and entrepreneurship.",
  alternates: { canonical: "https://cdsspace.pro/blog" },
  openGraph: {
    title: "CDS Space Blog - Insights. Research. Growth.",
    description: "Thoughts, case studies, audits, and insights from CDS Space.",
    url: "https://cdsspace.pro/blog",
    type: "website",
  },
};

export default function BlogPage() {
  return <BlogLanding />;
}
