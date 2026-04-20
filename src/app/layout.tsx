import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#040b37",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://cdsspace.pro"),
  title: {
    default: "CDS Space — Branding Agency | Brand Identity, Web Development & Industrial Print",
    template: "%s | CDS Space",
  },
  description: "CDS Space is a full-service branding agency specializing in brand identity design, UI/UX, web development, industrial print production, and brand consultancy. We help forward-thinking brands create great experiences.",
  keywords: [
    "CDS Space", "CDSSpace", "branding agency", "brand identity design",
    "UI/UX design", "web development", "industrial print", "brand consultancy",
    "logo design", "packaging design", "environmental branding",
    "brand communications", "marketing agency", "creative agency",
    "Web3 branding", "Uyo branding agency", "Nigeria branding agency",
  ],
  authors: [{ name: "CDS Space", url: "https://cdsspace.pro" }],
  creator: "CDS Space",
  publisher: "CDS Space",
  alternates: {
    canonical: "https://cdsspace.pro",
  },
  openGraph: {
    title: "CDS Space — Branding Agency | Brand Identity, Web Development & Industrial Print",
    description: "We help forward-thinking brands and individuals create great experiences, forging connections between people, brands, and cultures through premium design and production.",
    url: "https://cdsspace.pro",
    siteName: "CDS Space",
    images: [
      {
        url: "/navbar/CDS Logo.svg",
        width: 1200,
        height: 630,
        alt: "CDS Space Branding Agency",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CDS Space — Branding Agency",
    description: "Full-service branding agency specializing in brand identity, UI/UX, web development, and industrial print production.",
    creator: "@cdsspace_",
    site: "@cdsspace_",
    images: ["/navbar/CDS Logo.svg"],
  },
  icons: {
    icon: "/navbar/CDS Logo.svg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

import { AuthProvider } from "@/contexts/auth-context";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "CDS Space",
              url: "https://cdsspace.pro",
              logo: "https://cdsspace.pro/navbar/CDS Logo.svg",
              description:
                "Full-service branding agency specializing in brand identity design, UI/UX, web development, industrial print production, and brand consultancy.",
              sameAs: [
                "https://www.instagram.com/cdsspace",
                "https://twitter.com/cdsspace_",
                "https://web.facebook.com/cdsspace",
                "https://www.tiktok.com/@cdsspace_",
                "https://www.youtube.com/@cdsspacelive",
              ],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer service",
                url: "https://cdsspace.pro/Contact",
              },
              serviceType: [
                "Brand Identity Design",
                "UI/UX Design",
                "Web Development",
                "Industrial Print Production",
                "Brand Consultancy",
                "Environmental Branding",
                "Packaging Design",
              ],
            }),
          }}
        />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
