import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, createSessionCookie } from './lib/auth';
import { middleware } from './middleware';

vi.mock('@/lib/auth', async () => import('./lib/auth'));

beforeEach(() => vi.stubEnv('AUTH_SECRET', 'test-session-secret'));
afterEach(() => vi.unstubAllEnvs());

async function request(path: string, role?: 'admin' | 'operator', expired = false) {
  const headers = new Headers();
  if (role) {
    const cookie = await createSessionCookie(
      { email: 'test@example.com', role, exp: Date.now() + (expired ? -1000 : 86400000) },
      'test-session-secret',
    );
    headers.set('Cookie', `${AUTH_COOKIE_NAME}=${cookie}`);
  }
  return middleware(new NextRequest(new URL(path, 'https://meet.example.com'), { headers }));
}

describe('persistent session navigation', () => {
  it('recognizes the saved admin cookie when reopening the home page', async () => {
    const response = await request('/', 'admin');
    expect(response.headers.get('location')).toBe('https://meet.example.com/admin');
  });

  it('recognizes the saved operator cookie when reopening the home page', async () => {
    const response = await request('/', 'operator');
    expect(new URL(response.headers.get('location')!).pathname).toMatch(/^\/rooms\//);
  });

  it('skips the login form and preserves an authorized room destination', async () => {
    const response = await request('/login?next=%2Frooms%2Fmision%3Fhq%3Dtrue', 'operator');
    expect(response.headers.get('location')).toBe('https://meet.example.com/rooms/mision?hq=true');
  });

  it.each(['https://outside.example.com', '//outside.example.com', '/\\outside.example.com/rooms/test', '/login', '/api/auth/logout', '/admin']) (
    'rejects unsafe or unauthorized return destinations: %s',
    async (destination) => {
      const response = await request(`/login?next=${encodeURIComponent(destination)}`, 'operator');
      const target = new URL(response.headers.get('location')!);
      expect(target.origin).toBe('https://meet.example.com');
      expect(target.pathname).toMatch(/^\/rooms\//);
    },
  );

  it.each(['/', '/login'])('keeps %s public for signed-out visitors', async (path) => {
    const response = await request(path);
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('does not reuse an expired session', async () => {
    const response = await request('/login', 'operator', true);
    expect(response.headers.get('location')).toBeNull();
  });

  it('still protects rooms and API endpoints', async () => {
    expect((await request('/rooms/mision')).headers.get('location')).toContain('/login?');
    expect((await request('/api/connection-details')).status).toBe(401);
  });
});