import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Facultades/carreras de PRUEBA — a diferencia de las categorías de
 * actividad de 003 (bloqueadas porque no existen), este catálogo sí existe
 * en la realidad, pero no está verificado en este diseño. Sembrar el
 * catálogo real de la UCB queda como checklist de salida a producción (ver
 * Grupo 9 de tasks.md) — esto NUNCA debe correr contra producción.
 */
async function seedTestCatalog(): Promise<void> {
  const faculty = await prisma.faculty.upsert({
    where: { name: '[PRUEBA] Facultad de Ingeniería' },
    update: {},
    create: { name: '[PRUEBA] Facultad de Ingeniería' },
  });

  await prisma.career.upsert({
    where: { facultyId_name: { facultyId: faculty.id, name: '[PRUEBA] Ingeniería de Sistemas' } },
    update: {},
    create: { facultyId: faculty.id, name: '[PRUEBA] Ingeniería de Sistemas' },
  });

  await prisma.career.upsert({
    where: { facultyId_name: { facultyId: faculty.id, name: '[PRUEBA] Ingeniería Comercial' } },
    update: {},
    create: { facultyId: faculty.id, name: '[PRUEBA] Ingeniería Comercial' },
  });
}

/**
 * Versión de consentimiento MARCADOR DE POSICIÓN — RF-128: no existe
 * todavía un texto legal aprobado por la universidad. El registro exige una
 * versión activa para operar, así que hace falta al menos una desde el
 * día 1. Publicar el texto real como nueva versión (vía
 * POST /consent-versions) es parte del checklist de salida a producción.
 */
async function seedPlaceholderConsentVersion(): Promise<void> {
  const alreadyActive = await prisma.consentVersion.findFirst({ where: { isActive: true } });
  if (alreadyActive) return;

  await prisma.consentVersion.create({
    data: {
      version: 'placeholder-v0',
      body:
        '[BORRADOR — reemplazar antes de producción] Acepto el tratamiento de mis ' +
        'datos personales para la organización del evento TEDxUCB y el uso de mi ' +
        'imagen en el registro fotográfico del evento.',
      isActive: true,
    },
  });
}

async function main(): Promise<void> {
  await seedTestCatalog();
  await seedPlaceholderConsentVersion();
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
