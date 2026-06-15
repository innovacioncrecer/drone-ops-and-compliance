import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_TTL_SECONDS,
  AuthRole,
  createSessionCookie,
  getAuthSecret,
  isAuthRole,
} from '@/lib/auth';
import prisma from '@/lib/prisma';
import { compare } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

type LoginBody = {
  email?: unknown;
  password?: unknown;
  role?: unknown;
};

const ROL_MAP: Record<string, AuthRole> = {
  ADMIN: 'admin',
  OPERADOR: 'operator',
  PILOTO: 'operator',
  OBSERVADOR: 'operator',
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginBody;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const requestedRole = isAuthRole(body.role) ? body.role : null;

  if (!email || !password || !requestedRole) {
    return new NextResponse('Correo, contraseña y rol son requeridos.', { status: 400 });
  }

  const authSecret = getAuthSecret();
  if (!authSecret) {
    return new NextResponse('AUTH_SECRET no está configurado.', { status: 500 });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, email: true, rol: true, activo: true, passwordHash: true },
  });

  const credencialesInvalidas = new NextResponse('Credenciales inválidas.', { status: 401 });

  if (!usuario || !usuario.activo || !usuario.passwordHash) {
    return credencialesInvalidas;
  }

  const passwordValido = await compare(password, usuario.passwordHash);
  if (!passwordValido) {
    return credencialesInvalidas;
  }

  const rolUsuario = ROL_MAP[usuario.rol] ?? 'operator';

  if (requestedRole === 'admin' && rolUsuario !== 'admin') {
    return new NextResponse('No tienes permisos de administrador.', { status: 403 });
  }

  const cookieValue = await createSessionCookie(
    {
      email: usuario.email!,
      role: rolUsuario,
      exp: Date.now() + AUTH_SESSION_TTL_SECONDS * 1000,
    },
    authSecret,
  );

  const response = NextResponse.json({ ok: true, role: rolUsuario });
  response.cookies.set(AUTH_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_SESSION_TTL_SECONDS,
  });

  return response;
}
