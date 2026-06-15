import prisma from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ROL_MAP: Record<string, string> = {
  administrador: 'ADMIN',
  operador: 'OPERADOR',
  piloto: 'PILOTO',
  observador: 'OBSERVADOR',
};

const ROL_LABEL: Record<string, string> = {
  ADMIN: 'administrador',
  OPERADOR: 'operador',
  PILOTO: 'piloto',
  OBSERVADOR: 'observador',
};

function toAdminUser(u: {
  id: string;
  nombre: string;
  email: string | null;
  rol: string;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}) {
  return {
    id: u.id,
    name: u.nombre,
    email: u.email ?? '',
    role: ROL_LABEL[u.rol] ?? 'operador',
    status: u.activo ? 'activo' : 'inactivo',
    createdAt: u.creadoEn.toISOString(),
    updatedAt: u.actualizadoEn.toISOString(),
  };
}

export async function GET() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true, actualizadoEn: true },
    orderBy: { creadoEn: 'desc' },
  });
  return NextResponse.json({ users: usuarios.map(toAdminUser) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const status = typeof body.status === 'string' ? body.status : 'activo';

  if (!name) return new NextResponse('El nombre es requerido.', { status: 400 });
  if (!email) return new NextResponse('El correo es requerido.', { status: 400 });
  if (!password || password.length < 8)
    return new NextResponse('La contraseña debe tener al menos 8 caracteres.', { status: 400 });
  if (!ROL_MAP[role]) return new NextResponse('Rol inválido.', { status: 400 });

  const passwordHash = await hash(password, 12);
  const identidad = `${name.replace(/\s+/g, '_').toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: name,
        email,
        passwordHash,
        rol: ROL_MAP[role] as 'ADMIN' | 'OPERADOR' | 'PILOTO' | 'OBSERVADOR',
        activo: status === 'activo',
        identidad,
      },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true, actualizadoEn: true },
    });
    return NextResponse.json({ user: toAdminUser(usuario) }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return new NextResponse('Ya existe un usuario con ese correo.', { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const status = typeof body.status === 'string' ? body.status : '';

  if (!id) return new NextResponse('ID requerido.', { status: 400 });
  if (!name) return new NextResponse('El nombre es requerido.', { status: 400 });
  if (!email) return new NextResponse('El correo es requerido.', { status: 400 });
  if (!ROL_MAP[role]) return new NextResponse('Rol inválido.', { status: 400 });
  if (password && password.length < 8)
    return new NextResponse('La contraseña debe tener al menos 8 caracteres.', { status: 400 });

  const data: Record<string, unknown> = {
    nombre: name,
    email,
    rol: ROL_MAP[role],
    activo: status === 'activo',
  };

  if (password) {
    data.passwordHash = await hash(password, 12);
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data,
      select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true, actualizadoEn: true },
    });
    return NextResponse.json({ user: toAdminUser(usuario) });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      if (code === 'P2002') return new NextResponse('Ya existe otro usuario con ese correo.', { status: 409 });
      if (code === 'P2025') return new NextResponse('Usuario no encontrado.', { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return new NextResponse('ID requerido.', { status: 400 });

  try {
    await prisma.usuario.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return new NextResponse('Usuario no encontrado.', { status: 404 });
    }
    throw error;
  }
}
