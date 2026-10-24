import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { prismaTestClient } from './prisma-test-client';

interface SeedUserOptions {
  email: string;
  password?: string;
  fullName?: string;
  nickname?: string | null;
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
    nickname: suppliedNickname,
    status = 'ACTIVE',
    registrationSource = 'ADMIN_CREATED',
    roles = ['ALUMNO'],
  } = options;
  const nickname = suppliedNickname === undefined
    ? `Test${randomUUID().replaceAll('-', '').slice(0, 12)}`
    : suppliedNickname;

  const passwordHash = status === 'INVITED' ? null : await argon2.hash(password, { type: argon2.argon2id });

  const user = await prismaTestClient.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      fullName,
      nickname,
      nicknameKey: nickname ? nickname.toLowerCase().normalize('NFKC') : null,
      status,
      registrationSource,
      roles: { create: roles.map((role) => ({ role })) },
    },
    include: { roles: true },
  });

  if (roles.includes('ADMIN')) {
    const events = await prismaTestClient.event.findMany({ select: { id: true } });
    if (events.length) {
      await prismaTestClient.eventEmailAccess.createMany({
        data: events.map((event) => ({ emailNormalized: user.email, eventId: event.id })),
        skipDuplicates: true,
      });
    }
  }

  return user;
}
