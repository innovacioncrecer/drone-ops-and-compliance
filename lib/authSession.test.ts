import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, AUTH_SESSION_TTL_SECONDS, verifySessionCookie } from './auth';
import { POST as login } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), compare: vi.fn() }));

vi.mock('@/lib/auth', async () => import('./auth'));
vi.mock('@/lib/prisma', () => ({ default: { usuario: { findUnique: mocks.findUnique } } }));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_SECRET', 'test-session-secret');
  vi.stubEnv('AUTH_COOKIE_SECURE', 'true');
  mocks.findUnique.mockResolvedValue({
    id: 'test-user',
    email: 'test@example.com',
    rol: 'OPERADOR',
    activo: true,
    passwordHash: 'test-hash',
  });
  mocks.compare.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function loginRequest() {
  return new NextRequest('https://meet.example.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'test-password', role: 'operator' }),
  });
}

describe('persistent authentication cookie', () => {
  it('issues a secure HttpOnly cookie valid for 30 days after closing the browser', async () => {
    const response = await login(loginRequest());
    const cookie = response.cookies.get(AUTH_COOKIE_NAME)!;
    expect(response.status).toBe(200);
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_SESSION_TTL_SECONDS,
      expires: new Date('2026-11-08T12:00:00Z'),
    });
    vi.advanceTimersByTime(86400000);
    expect(await verifySessionCookie(cookie.value, 'test-session-secret')).toMatchObject({
      email: 'test@example.com',
      role: 'operator',
      exp: new Date(cookie.expires!).getTime(),
    });
    vi.advanceTimersByTime(AUTH_SESSION_TTL_SECONDS * 1000);
    expect(await verifySessionCookie(cookie.value, 'test-session-secret')).toBeNull();
  });

  it('honors the explicit HTTP development override for both login and logout', async () => {
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    const loginCookie = (await login(loginRequest())).cookies.get(AUTH_COOKIE_NAME)!;
    const logoutCookie = (await logout()).cookies.get(AUTH_COOKIE_NAME)!;
    expect(loginCookie.secure).toBe(false);
    expect(logoutCookie.secure).toBe(false);
    expect(logoutCookie).toMatchObject({ value: '', maxAge: 0, path: '/' });
  });

  it('deletes the persistent cookie on explicit logout with matching secure attributes', async () => {
    const response = await logout();
    expect(response.cookies.get(AUTH_COOKIE_NAME)).toMatchObject({
      value: '', maxAge: 0, path: '/', secure: true, httpOnly: true, sameSite: 'lax',
    });
  });

  it('does not issue a cookie for invalid credentials', async () => {
    mocks.compare.mockResolvedValue(false);
    const response = await login(loginRequest());
    expect(response.status).toBe(401);
    expect(response.cookies.get(AUTH_COOKIE_NAME)).toBeUndefined();
  });
});