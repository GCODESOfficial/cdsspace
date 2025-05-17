// app/admin/layout.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile'; // correct import

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isMobile) {
      router.replace('/mobile-blocked');
    }
  }, [isMobile, pathname, router]);

  if (isMobile) return null;

  return <>{children}</>;
}