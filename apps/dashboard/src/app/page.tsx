'use client';

/**
 * Page racine — redirige directement vers /chimera (auth bypassé en dev)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LandingPage from './(marketing)/page';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/chimera');
  }, [router]);

  return <LandingPage />;
}
