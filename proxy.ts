// Next.js 16 renamed `middleware.ts` to `proxy.ts`. The behavior is identical:
// runs on every matching request before the route renders. We use it as the
// UI-layer auth gate that complements Postgres RLS (defense in depth).
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getUserRole } from '@/lib/auth/get-user-role';

const PUBLIC_PATHS = [
  '/',
  '/about',
  '/pricing',
  '/faq',
  '/login',
  '/auth/callback',
  '/auth/sign-out',
  '/request-to-join',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/error',
];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks')
  );
}

export async function proxy(request: NextRequest) {
  const { response, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return response;

  const role = await getUserRole(supabase);

  if (role.kind === 'unauthenticated') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/coach') && role.kind !== 'coach') {
    const url = request.nextUrl.clone();
    url.pathname = role.kind === 'athlete' ? '/app' : '/login';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/app') && role.kind !== 'athlete') {
    const url = request.nextUrl.clone();
    url.pathname = role.kind === 'coach' ? '/coach' : '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'],
};
