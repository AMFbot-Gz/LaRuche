import type { Metadata } from 'next';
import '@saas/ui-kit/src/styles/globals.css';

export const metadata: Metadata = {
    title: 'Chimera — L\'agent IA qui pilote ton Mac',
    description:
        'Chimera automatise ton Mac avec Computer Use, génère du code en sandbox sécurisé et apprend de chaque session.',
};

/**
 * Layout minimal pour les pages publiques marketing.
 * Pas de sidebar, pas de header applicatif — juste le contenu pleine page
 * avec le fond Catppuccin Mocha.
 */
export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="fr" className="dark">
            <body
                style={{
                    margin: 0,
                    padding: 0,
                    background: '#1e1e2e',
                    color: '#cdd6f4',
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                }}
            >
                {children}
            </body>
        </html>
    );
}
