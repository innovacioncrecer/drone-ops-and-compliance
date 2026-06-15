import { hash } from 'bcryptjs';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  if (!adminPassword) {
    throw new Error('Falta ADMIN_SEED_PASSWORD en .env.local');
  }

  const passwordHash = await hash(adminPassword, 12);

  const admin = await prisma.usuario.upsert({
    where: { email: 'luis@crecerlab.com' },
    update: {
      passwordHash,
      rol: 'ADMIN',
      activo: true,
    },
    create: {
      identidad: 'luis-crecerlab',
      nombre: 'Luis',
      email: 'luis@crecerlab.com',
      passwordHash,
      rol: 'ADMIN',
      activo: true,
    },
  });

  console.log(`✓ Administrador creado/actualizado: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
