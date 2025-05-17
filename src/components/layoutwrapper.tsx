'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import AOS from 'aos';
import 'aos/dist/aos.css';

import { ThemeProvider } from '@/components/theme-provider';
import { SonnerProvider } from '@/components/sonner-provider';
import { AuthProvider } from '@/contexts/auth-context';
import Navbar from '@/components/navbar'; // Adjust path if needed
import Footer from '@/components/footer'; // Adjust path if needed

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isLogin = pathname.startsWith('/login');
  const isLinks = pathname.startsWith('/Links');

  useEffect(() => {
    AOS.init({ duration: 800, once: true });
    AOS.refresh(); // <- forces recalculation
  }, []);
  

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        {!isAdmin && !isLogin && !isLinks && <Navbar />}
        <main>{children}</main>
        {!isAdmin && !isLogin && !isLinks && <Footer />}
        <SonnerProvider />
      </AuthProvider>
    </ThemeProvider>
  );
}