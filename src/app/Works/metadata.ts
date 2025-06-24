// src/app/Works/metadata.ts
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Work | CDSSpace Branding Agency",
  description: "Discover a curated showcase of our most impactful branding, web, and creative projects. See how CDSSpace transforms ideas into experiences.",
  openGraph: {
    title: "Our Work | CDSSpace Branding Agency",
    description: "Discover a curated showcase of our most impactful branding, web, and creative projects. See how CDSSpace transforms ideas into experiences.",
    url: "https://cdsspace.com/works",
    type: "website",
    images: [
      {
        url: "/images/work.jpg",
        width: 1200,
        height: 630,
        alt: "CDSSpace Project Showcase",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Our Work | CDSSpace Branding Agency",
    description: "Discover a curated showcase of our most impactful branding, web, and creative projects. See how CDSSpace transforms ideas into experiences.",
    images: ["/images/work.jpg"],
  },
};
