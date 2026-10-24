import { prismaTestClient, cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { seedEvent, seedContentBlock } from '../support/seed-content';

describe('Restricciones del motor — tablas de content (T024 parcial: events/content_blocks)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('permite publicar ambos eventos de forma independiente', async () => {
    const tedx = await seedEvent({ status: 'PUBLISHED' });
    const innovation = await seedEvent({
      slug: 'innovation-week',
      name: 'Semana de la Facultad',
      status: 'PUBLISHED',
    });

    expect(tedx.status).toBe('PUBLISHED');
    expect(innovation.status).toBe('PUBLISHED');
    expect(innovation.id).not.toBe(tedx.id);
  });

  it('un segundo evento en DRAFT convive sin problema con uno publicado', async () => {
    await seedEvent({ status: 'PUBLISHED' });

    await expect(seedEvent({ status: 'DRAFT' })).resolves.toBeDefined();
  });

  it('rechaza capacity 0 o negativo; acepta null o positivo', async () => {
    await expect(
      prismaTestClient.event.create({
        data: { name: 'Evento', startsAt: new Date(), capacity: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      prismaTestClient.event.create({
        data: { name: 'Evento', startsAt: new Date(), capacity: -1 },
      }),
    ).rejects.toThrow();

    await expect(
      prismaTestClient.event.create({
        data: { name: 'Evento', startsAt: new Date(), capacity: 500 },
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza un status fuera de DRAFT/PUBLISHED', async () => {
    await expect(
      prismaTestClient.event.create({
        data: { name: 'Evento', startsAt: new Date(), status: 'ARCHIVED' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una key de bloque de contenido con mayúsculas, guiones o espacios', async () => {
    await expect(seedContentBlock({ key: 'Con Mayúscula' })).rejects.toThrow();
    await expect(seedContentBlock({ key: 'con-guion' })).rejects.toThrow();
    await expect(seedContentBlock({ key: 'con espacio' })).rejects.toThrow();
  });

  it('acepta una key de bloque de contenido en minúsculas/números/guión bajo', async () => {
    await expect(seedContentBlock({ key: 'valido_123' })).resolves.toBeDefined();
  });

  it('rechaza un body de bloque de contenido en blanco', async () => {
    await expect(
      prismaTestClient.contentBlock.create({ data: { eventId: (await seedEvent()).id, key: 'vacio', body: '   ' } }),
    ).rejects.toThrow();
  });
});
