import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * middleware.ts — Auth bypassé en dev local
 *
 * Pour activer Clerk en prod : remplacer ce fichier par la version
 * qui se trouve dans src/middleware.clerk.ts.bak
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
