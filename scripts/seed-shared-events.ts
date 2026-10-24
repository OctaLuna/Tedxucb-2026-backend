import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Seed exclusivamente del entorno local aislado; nunca contra Supabase.
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || url.pathname !== '/ted_integration_test') {
  throw new Error('Este seed requiere la base local aislada ted_integration_test.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });

async function ensureEvent(slug: string, name: string, startsAt: string): Promise<void> {
  if (await prisma.event.findUnique({ where: { slug } })) return;
  const matches = await prisma.event.findMany({ where: { name }, select: { id: true, slug: true } });
  if (matches.length > 1 || (matches[0] && matches[0].slug !== null)) {
    throw new Error(`No se puede asociar ${slug}: hay eventos existentes ambiguos.`);
  }
  if (matches[0]) {
    await prisma.event.update({ where: { id: matches[0].id }, data: { slug } });
    return;
  }
  await prisma.event.create({ data: { slug, name, startsAt: new Date(startsAt), status: 'DRAFT' } });
}

async function main(): Promise<void> {
  await ensureEvent('tedxucb', 'TEDxUCB', '2026-11-09T14:00:00-04:00');
  // La fecha procede de frontend/src/config/event.ts y debe revisarse al desplegar.
  await ensureEvent('innovation-week', 'Semana de la Facultad', '2026-09-07T09:00:00-04:00');
}

main().finally(() => prisma.$disconnect()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudieron configurar los eventos.');
  process.exitCode = 1;
});
