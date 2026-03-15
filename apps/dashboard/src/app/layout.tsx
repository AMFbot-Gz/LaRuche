import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import Providers from './providers';
import '@saas/ui-kit/src/styles/globals.css';

export const metadata: Metadata = {
    title: 'Revenue OS — Closer Command Center',
    description: 'AI-powered sales closing assistant with real-time coaching',
    icons: {
        icon: '/favicon.ico',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ClerkProvider>
            <html lang="en" className="dark">
                <body className="bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500/30">
                    <Providers>
                        {children}
                    </Providers>
                </body>
            </html>
        </ClerkProvider>
    );
}
