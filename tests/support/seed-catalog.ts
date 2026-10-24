import { prismaTestClient } from './prisma-test-client';
import { seedUser } from './seed-user';

/** Facultad/carrera de prueba -- nunca presentes en producción (ver data-model.md §8). */
export async function seedCareer(overrides: { facultyName?: string; careerName?: string } = {}) {
  const faculty = await prismaTestClient.faculty.create({
    data: { name: overrides.facultyName ?? `Facultad de prueba ${Date.now()}-${Math.random()}` },
  });
  const career = await prismaTestClient.career.create({
    data: { facultyId: faculty.id, name: overrides.careerName ?? 'Carrera de prueba' },
  });
  return { faculty, career };
}

export async function seedConsentVersion(overrides: { active?: boolean } = {}) {
  return prismaTestClient.consentVersion.create({
    data: {
      version: `test-${Date.now()}-${Math.random()}`,
      body: 'Texto de consentimiento de prueba.',
      isActive: overrides.active ?? true,
    },
  });
}

/** Alumno completo: users + student_profiles (+ carrera/facultad si no se pasa una). */
export async function seedStudent(overrides: {
  email: string;
  password?: string;
  fullName?: string;
  status?: 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REJECTED';
  studentCode?: string;
  careerId?: string;
}) {
  const user = await seedUser({
    email: overrides.email,
    password: overrides.password,
    fullName: overrides.fullName,
    status: overrides.status ?? 'ACTIVE',
    registrationSource: 'SELF_REGISTRATION',
    roles: ['ALUMNO'],
  });
  if (user.email.endsWith('@ucb.edu.bo')) {
    await prismaTestClient.userIdentity.create({
      data: { userId: user.id, provider: 'GOOGLE', subject: `test-google-${user.id}`, verifiedEmail: user.email, hostedDomain: 'ucb.edu.bo' },
    });
  }

  const careerId = overrides.careerId ?? (await seedCareer()).career.id;

  const studentProfile = await prismaTestClient.studentProfile.create({
    data: {
      userId: user.id,
      studentCode: overrides.studentCode ?? `code-${Date.now()}-${Math.random()}`,
      careerId,
      academicPeriod: '5to semestre',
      phone: '+59170000000',
    },
  });

  return { user, studentProfile };
}
