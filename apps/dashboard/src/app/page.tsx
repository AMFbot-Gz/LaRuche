'use client';

/**
 * Page racine — redirige vers /chimera si l'utilisateur est connecté,
 * affiche la landing Chimera OS sinon.
 *
 * Cette redirection est gérée côté client pour garder la landing publique
 * (pas de Clerk.protect() sur /) tout en envoyant les users auth vers l'app.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

// Importer la landing page publique directement
import LandingPage from './(marketing)/page';

export default function RootPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/chimera');
    }
  }, [isLoaded, isSignedIn, router]);

  // Afficher la landing pendant le chargement ou si non connecté
  return <LandingPage />;
}
