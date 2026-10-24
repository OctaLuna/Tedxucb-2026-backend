import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import type { EnvConfig } from '../../config/env.validation';

const ADMIN_EVENT_SLUGS = ['tedxucb', 'innovation-week'] as const;

@Injectable()
export class ConfiguredAdminAccessService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  isConfiguredAdmin(email: string): boolean {
    return this.config.get('ADMIN_EMAILS', { infer: true }).includes(normalizeEmail(email));
  }

  async grantBothEvents(tx: Prisma.TransactionClient, userId: string, email: string): Promise<void> {
    const events = await tx.event.findMany({
      where: { slug: { in: [...ADMIN_EVENT_SLUGS] } },
      select: { id: true, slug: true },
    });
    if (events.length !== ADMIN_EVENT_SLUGS.length) {
      throw new AppException(503, 'EVENTS_NOT_CONFIGURED', 'Los dos eventos deben estar configurados para habilitar administración.');
    }

    await tx.userRole.upsert({
      where: { userId_role: { userId, role: 'ADMIN' } },
      create: { userId, role: 'ADMIN' },
      update: {},
    });

    const emailNormalized = normalizeEmail(email);
    for (const event of events) {
      await tx.eventEmailAccess.upsert({
        where: { emailNormalized_eventId: { emailNormalized, eventId: event.id } },
        create: { emailNormalized, eventId: event.id },
        update: { revokedAt: null },
      });
    }
  }
}
