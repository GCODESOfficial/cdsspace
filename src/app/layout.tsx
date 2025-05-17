import type React from "react"
import "@/app/globals.css"
import { Poppins } from 'next/font/google';
import LayoutWrapper from "@/components/layoutwrapper"; // adjust path accordingly

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata = {
  title: "Web3 Branding & Product Development",
  description: "Web3 Branding & Product Development Portfolio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={poppins.className}>
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
