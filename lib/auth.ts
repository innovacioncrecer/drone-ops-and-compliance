export type AuthRole = 'admin' | 'operator';

export type AuthSession = {
  email: string;
  role: AuthRole;
  exp: number;
};

export const AUTH_COOKIE_NAME = 'droneops-session';
export const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  return process.env.NODE_ENV === 'production' ? '' : 'droneops-dev-secret';
}

export async function createSessionCookie(session: AuthSession, secret: string): Promise<string> {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionCookie(
  cookieValue: string | undefined,
  secret: string,
): Promise<AuthSession | null> {
  if (!cookieValue) return null;

  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = await signPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as Partial<AuthSession>;
    if (!isAuthRole(session.role)) return null;
    if (typeof session.email !== 'string' || !session.email) return null;
    if (typeof session.exp !== 'number' || session.exp < Date.now()) return null;

    return {
      email: session.email,
      role: session.role,
      exp: session.exp,
    };
  } catch {
    return null;
  }
}

export function canAccessPath(role: AuthRole, pathname: string): boolean {
  if (role === 'admin') return true;
  return !pathname.startsWith('/admin') && !pathname.startsWith('/api/admin');
}

export function isAuthRole(value: unknown): value is AuthRole {
  return value === 'admin' || value === 'operator';
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return arrayBufferToHex(signature);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
