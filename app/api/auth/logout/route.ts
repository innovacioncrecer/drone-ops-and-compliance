import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(),
    path: '/',
    maxAge: 0,
  });

  return response;
}

function shouldUseSecureCookie(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}
