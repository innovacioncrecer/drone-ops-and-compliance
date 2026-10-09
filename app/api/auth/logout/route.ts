import { AUTH_COOKIE_NAME, getAuthCookieOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, '', getAuthCookieOptions(0));

  return response;
}
