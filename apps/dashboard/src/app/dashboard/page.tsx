'use client';

/**
 * app/dashboard/page.tsx — Redirection vers /chimera
 *
 * Cette page redirige les utilisateurs qui atterrissent sur /dashboard
 * vers le vrai dashboard Chimera OS à /chimera.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/chimera');
  }, [router]);

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#0f1117',
      color: 'rgba(255,255,255,0.3)', fontSize: '14px', fontFamily: 'system-ui, sans-serif',
    }}>
      Redirection vers Chimera OS…
    </div>
  );
}
