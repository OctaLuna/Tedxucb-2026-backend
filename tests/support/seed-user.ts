import * as argon2 from 'argon2';
import { prismaTestClient } from './prisma-test-client';

interface SeedUserOptions {
  email: string;
  password?: string;
  fullName?: string;
  status?: 'INVITED' | 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REJECTED';
  registrationSource?: 'SELF_REGISTRATION' | 'ADMIN_CREATED';
  roles?: Array<'ADMIN' | 'STAFF' | 'ALUMNO'>;
}

/** Siembra un usuario directo por Prisma — auth no depende del módulo users. */
export async function seedUser(options: SeedUserOptions) {
  const {
    email,
    password = 'unaClaveSegura9',
    fullName = 'Alumno de Prueba',
    status = 'ACTIVE',
    registrationSource = 'ADMIN_CREATED',
    roles = ['ALUMNO'],
  } = options;

  const passwordHash = status === 'INVITED' ? null : await argon2.hash(password, { type: argon2.argon2id });

  const user = await prismaTestClient.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      fullName,
      status,
      registrationSource,
      roles: { create: roles.map((role) => ({ role })) },
    },
    include: { roles: true },
  });

  return user;
}
