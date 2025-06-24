/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import type React from "react";
import "@/app/globals.css";
import LayoutWrapper from "@/components/layoutwrapper";
import ClientOnly from "@/components/ClientOnly";

export const metadata: Metadata = {
  title: "CDS Space Branding Agency",
  description:
    "We help forward thinking brands and individuals create great experiences for their users, forging connections betweeb people, brands, and cultures. Our service scope includes web3 & web2 product development, Brand Identity Design, Industrial Print Production, Brand Communications and Marketing, Environmental Branding, Brand Consultancy",
  keywords: [
    "CDSSpace",
    "Branding",
    "Branding Agency",
    "UI/UX",
    "Web Development",
    "Event Branding",
    "Print Logistics",
    "Merch Printing & Packaging",
    "Modelling",
    "Brand Identity",
  ],
  authors: [{ name: "CDS Space", url: "https://cdsspace.com" }],
  metadataBase: new URL("https://cdsspace.com"),
  openGraph: {
    title: "CDS Space Branding Agency",
    description:
      "We help forward thinking brands and individuals create great experiences for their users, forging connections betweeb people, brands, and cultures. Our service scope includes web3 & web2 product development, Brand Identity Design, Industrial Print Production, Brand Communications and Marketing, Environmental Branding, Brand Consultancy",
    images: [
      {
        url: "/images/Metadata.png",
        width: 1200,
        height: 630,
        alt: "cdsspace Overview",
      },
    ],
    url: "https://cdsspace.com",
    siteName: "CDS Space",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CDS Space Branding Agency",
    description:
      "We help forward thinking brands and individuals create great experiences for their users, forging connections betweeb people, brands, and cultures. Our service scope includes web3 & web2 product development, Brand Identity Design, Industrial Print Production, Brand Communications and Marketing, Environmental Branding, Brand Consultancy",
    images: ["/images/Metadata.png"],
    creator: "@cdsspace_",
  },
  category: "technology",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`antialiased`}>
        <ClientOnly>
          <LayoutWrapper>{children}</LayoutWrapper>
        </ClientOnly>
      </body>
    </html>
  );
}
