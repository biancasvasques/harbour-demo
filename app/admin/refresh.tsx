'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Re-reads the page data every few seconds, so new messages and alerts show up live.
export default function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
