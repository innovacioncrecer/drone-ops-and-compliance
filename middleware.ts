import {
  AUTH_COOKIE_NAME,
  canAccessPath,
  getAuthSecret,
  verifySessionCookie,
} from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = [
  '/admin',
  '/rooms',
  '/api/admin',
  '/api/agent',
  '/api/connection-details',
  '/api/record',
];
const SALA_PRINCIPAL = process.env.NEXT_PUBLIC_ROOM_NAME ?? 'droneops-sala-principal';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isEntryPage = pathname === '/' || pathname === '/login';
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected && !isEntryPage) {
    return NextResponse.next();
  }

  const session = await verifySessionCookie(
    request.cookies.get(AUTH_COOKIE_NAME)?.value,
    getAuthSecret(),
  );

  if (isEntryPage) {
    if (!session) return NextResponse.next();

    const fallback = session.role === 'admin' ? '/admin' : `/rooms/${SALA_PRINCIPAL}`;
    const nextPath = request.nextUrl.searchParams.get('next');
    let destination = new URL(fallback, request.url);
    if (pathname === '/login' && nextPath?.startsWith('/') && !nextPath.startsWith('//')) {
      const candidate = new URL(nextPath, request.url);
      const isAppPage =
        candidate.pathname === '/admin' ||
        candidate.pathname.startsWith('/admin/') ||
        candidate.pathname.startsWith('/rooms/');
      if (
        candidate.origin === request.nextUrl.origin &&
        isAppPage &&
        canAccessPath(session.role, candidate.pathname)
      ) {
        destination = candidate;
      }
    }
    return NextResponse.redirect(destination);
  }

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('No autenticado', { status: 401 });
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    loginUrl.searchParams.set('role', pathname.startsWith('/admin') ? 'admin' : 'operator');
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(session.role, pathname)) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('No autorizado', { status: 403 });
    }

    return NextResponse.redirect(new URL(`/rooms/${SALA_PRINCIPAL}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/admin/:path*',
    '/rooms/:path*',
    '/api/admin/:path*',
    '/api/agent/:path*',
    '/api/connection-details',
    '/api/record/:path*',
  ],
};
