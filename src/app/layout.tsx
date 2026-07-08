import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Neue Campton — the CDS Space brand typeface. Exposed as `--font-sans`, so
// every surface that uses `font-sans` / var(--font-sans) (marketing site,
// client/team/admin dashboards) picks it up automatically.
const neueCampton = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-Light-BF67089b6e958ed.otf", weight: "300", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-LightItalic-BF67089b6e98b40.otf", weight: "300", style: "italic" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-Regular-BF67089b6ea9633.otf", weight: "400", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-RegularItalic-BF67089b6eb3766.otf", weight: "400", style: "italic" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-Medium-BF67089b6e9f912.otf", weight: "500", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-MediumItalic-BF67089b6ea6ef3.otf", weight: "500", style: "italic" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-SemiBold-BF67089b6eb62b9.otf", weight: "600", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-SemiBoldItalic-BF67089b6ebdc29.otf", weight: "600", style: "italic" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-Bold-BF67089b65d3e98.otf", weight: "700", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-BoldItalic-BF67089b6e61f5b.otf", weight: "700", style: "italic" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-ExtraBold-BF67089b6e6381f.otf", weight: "800", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-ExtraBoldItalic-BF67089b6e69f0f.otf", weight: "800", style: "italic" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-Black-BF67089b6e2d5e5.otf", weight: "900", style: "normal" },
    { path: "../../public/font/neue-campton-font-family/NeueCamptonTest-BlackItalic-BF67089b6e3364d.otf", weight: "900", style: "italic" },
  ],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#040b37",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://cdsspace.pro"),
  // Google Search Console homepage-ownership verification for OAuth consent
  // screen review. Renders <meta name="google-site-verification" ...> on every
  // page (incl. the homepage) only when the env var is set - otherwise nothing
  // is emitted, so this is a no-op until the token is provided.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  title: {
    default: "CDS Space - Branding Agency | Brand Identity, Web Development & Industrial Print",
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
  // NOTE: no explicit `images` here - Next.js auto-picks up the nearest
  // `opengraph-image.tsx` / `twitter-image.tsx` per route segment and injects
  // the correct 1200×630 PNG URL. SVGs were previously ignored by WhatsApp/Meta,
  // which is why link previews came out text-only. Per-route images override.
  openGraph: {
    title: "CDS Space - Branding Agency | Brand Identity, Web Development & Industrial Print",
    description: "We help forward-thinking brands and individuals create great experiences, forging connections between people, brands, and cultures through premium design and production.",
    url: "https://cdsspace.pro",
    siteName: "CDS Space",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CDS Space - Branding Agency",
    description: "Full-service branding agency specializing in brand identity, UI/UX, web development, and industrial print production.",
    creator: "@cdsspace_",
    site: "@cdsspace_",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "554x554" },
    ],
    shortcut: "/favicon.png",
    apple: [
      { url: "/favicon.png", type: "image/png", sizes: "554x554" },
    ],
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
import { AppNotifyRoot } from "@/lib/app-notify";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${neueCampton.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "CDS Space",
              url: "https://cdsspace.pro",
              logo: "https://cdsspace.pro/mlogo.svg",
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
          <AppNotifyRoot />
        </AuthProvider>
      </body>
    </html>
  );
}
