import { prismaTestClient, cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { seedCareer, seedConsentVersion, seedStudent } from '../support/seed-catalog';

describe('Restricciones del motor — tablas de users/profiles (T028)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('rechaza dos alumnos con el mismo studentCode', async () => {
    await seedStudent({ email: 'a@ucb.edu.bo', studentCode: 'DUPLICADO' });

    await expect(seedStudent({ email: 'b@ucb.edu.bo', studentCode: 'DUPLICADO' })).rejects.toThrow();
  });

  it('el índice único parcial permite como máximo una versión de consentimiento activa', async () => {
    await seedConsentVersion({ active: true });

    await expect(seedConsentVersion({ active: true })).rejects.toThrow();
  });

  it('una carrera duplicada dentro de la misma facultad es rechazada', async () => {
    const { faculty } = await seedCareer({ careerName: 'Ingeniería de Sistemas' });

    await expect(
      prismaTestClient.career.create({ data: { facultyId: faculty.id, name: 'Ingeniería de Sistemas' } }),
    ).rejects.toThrow();
  });

  it('el mismo nombre de carrera en facultades distintas sí es válido', async () => {
    const { faculty: facultyA } = await seedCareer({ careerName: 'Ingeniería Comercial' });
    const facultyB = await prismaTestClient.faculty.create({ data: { name: `Otra facultad ${Date.now()}` } });

    await expect(
      prismaTestClient.career.create({ data: { facultyId: facultyB.id, name: 'Ingeniería Comercial' } }),
    ).resolves.toBeDefined();
    expect(facultyA.id).not.toEqual(facultyB.id);
  });

  it('una segunda solicitud de corrección pendiente para el mismo (alumno, campo) es rechazada', async () => {
    const { user } = await seedStudent({ email: 'correccion@ucb.edu.bo' });
    await prismaTestClient.correctionRequest.create({
      data: { studentId: user.id, field: 'studentCode', newValue: 'X', reason: 'motivo 1' },
    });

    await expect(
      prismaTestClient.correctionRequest.create({
        data: { studentId: user.id, field: 'studentCode', newValue: 'Y', reason: 'motivo 2' },
      }),
    ).rejects.toThrow();
  });
});
