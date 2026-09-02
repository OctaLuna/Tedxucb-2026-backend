import { prismaTestClient, cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { seedSpeaker, seedApplication, completeSpeakerFields } from '../support/seed-speakers';

describe('Restricciones del motor — tablas de speakers/applications (T024 restante)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('rechaza publicar un speaker incompleto', async () => {
    await expect(seedSpeaker({ status: 'PUBLISHED', headline: 'Solo esto' })).rejects.toThrow();
  });

  it('acepta publicar un speaker con todos los campos requeridos', async () => {
    await expect(seedSpeaker({ status: 'PUBLISHED', ...completeSpeakerFields() })).resolves.toBeDefined();
  });

  it('rechaza status CONVERTED sin convertedSpeakerId (converted_consistency)', async () => {
    await expect(seedApplication({ status: 'CONVERTED' })).rejects.toThrow();
  });

  it('rechaza convertedSpeakerId presente con status distinto de CONVERTED', async () => {
    const speaker = await prismaTestClient.speaker.create({ data: { fullName: 'Speaker' } });
    await expect(
      seedApplication({ status: 'PENDING', convertedSpeakerId: speaker.id }),
    ).rejects.toThrow();
  });

  it('rechaza status ACCEPTED sin reviewedBy/reviewedAt (reviewed_needs_reviewer)', async () => {
    await expect(seedApplication({ status: 'ACCEPTED' })).rejects.toThrow();
  });
});
