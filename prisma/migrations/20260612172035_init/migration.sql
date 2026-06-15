-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'OPERADOR', 'PILOTO', 'OBSERVADOR');

-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('PLANIFICADA', 'EN_CURSO', 'PAUSADA', 'COMPLETADA', 'CANCELADA', 'EMERGENCIA');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('BAJA', 'NORMAL', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "TipoHablante" AS ENUM ('USUARIO', 'DOCO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "identidad" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "rol" "RolUsuario" NOT NULL DEFAULT 'OPERADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "inicioEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finEn" TIMESTAMP(3),
    "duracionSeg" INTEGER,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operaciones" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'PLANIFICADA',
    "prioridad" "Prioridad" NOT NULL DEFAULT 'NORMAL',
    "sesionId" TEXT,
    "inicioEn" TIMESTAMP(3),
    "finEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "operacionId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "completadoEn" TIMESTAMP(3),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "categoria" TEXT,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "sesionId" TEXT,
    "usuarioId" TEXT,
    "operacionId" TEXT,
    "hablante" "TipoHablante" NOT NULL,
    "texto" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_identidad_key" ON "usuarios"("identidad");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "sesiones_salaId_idx" ON "sesiones"("salaId");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_codigo_key" ON "operaciones"("codigo");

-- CreateIndex
CREATE INDEX "operaciones_estado_idx" ON "operaciones"("estado");

-- CreateIndex
CREATE INDEX "checklist_items_operacionId_idx" ON "checklist_items"("operacionId");

-- CreateIndex
CREATE INDEX "transcripts_salaId_idx" ON "transcripts"("salaId");

-- CreateIndex
CREATE INDEX "transcripts_sesionId_idx" ON "transcripts"("sesionId");

-- CreateIndex
CREATE INDEX "transcripts_creadoEn_idx" ON "transcripts"("creadoEn");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "sesiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "sesiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
