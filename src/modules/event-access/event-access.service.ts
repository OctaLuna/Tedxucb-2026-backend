import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { ListEventAccessQueryDto } from './dto/list-event-access-query.dto';
import { SetEventAccessDto } from './dto/set-event-access.dto';

const DEFAULT_EVENT_SLUGS = ['tedxucb', 'innovation-week'];
const eventSelection = { id: true, slug: true, name: true } as const;

@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertEventAccess(userId: string, eventSlug: string): Promise<void> {
    const [user, event] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, status: true, identities: { select: { provider: true, verifiedEmail: true, hostedDomain: true } } },
      }),
      this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, slug: true } }),
    ]);
    if (!user || user.status !== 'ACTIVE') throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa.');
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    const institutional = user.email.endsWith('@ucb.edu.bo') && user.identities.some((identity) =>
      identity.provider === 'GOOGLE' && identity.verifiedEmail === user.email && identity.hostedDomain === 'ucb.edu.bo',
    );
    if (institutional && DEFAULT_EVENT_SLUGS.includes(eventSlug)) return;
    const explicitAccess = await this.prisma.eventEmailAccess.findFirst({
      where: { emailNormalized: user.email, eventId: event.id, revokedAt: null },
      select: { id: true },
    });
    if (!explicitAccess) throw new AppException(403, 'EVENT_ACCESS_DENIED', 'Tu cuenta no tiene acceso a este evento.');
  }

  async assertEventIdAccess(userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
    if (!event?.slug) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    await this.assertEventAccess(userId, event.slug);
  }

  async assertAdmin(userId: string): Promise<void> {
    const admin = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
      select: { id: true },
    });
    if (!admin) throw new AppException(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
  }

  async assertAdminEventAccess(userId: string, eventSlug: string): Promise<void> {
    await this.assertAdmin(userId);
    await this.assertEventAccess(userId, eventSlug);
  }

  async list(adminId: string, query: ListEventAccessQueryDto) {
    const { data: allowedEvents } = await this.eventsForUser(adminId);
    const allowedEventIds = allowedEvents.map(({ id }) => id);
    if (!allowedEventIds.length) {
      return { data: [], meta: { page: query.page, limit: query.limit, total: 0, totalPages: 1 } };
    }

    const filters = [Prisma.sql`event_id IN (${Prisma.join(allowedEventIds)})`];
    if (query.email) filters.push(Prisma.sql`strpos(email_normalized, ${query.email}) > 0`);
    if (query.status === 'active') filters.push(Prisma.sql`revoked_at IS NULL`);
    if (query.status === 'revoked') filters.push(Prisma.sql`revoked_at IS NOT NULL`);
    const where = Prisma.join(filters, ' AND ');
    const skip = (query.page - 1) * query.limit;

    const [emailRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ emailNormalized: string }>>(Prisma.sql`
        SELECT DISTINCT email_normalized AS "emailNormalized"
        FROM event_email_access
        WHERE ${where}
        ORDER BY email_normalized ASC
        LIMIT ${query.limit} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT email_normalized) AS total
        FROM event_email_access
        WHERE ${where}
      `),
    ]);
    const emails = emailRows.map(({ emailNormalized }) => emailNormalized);
    const total = Number(countRows[0]?.total ?? 0n);
    const data = emails.length ? await this.prisma.eventEmailAccess.findMany({
      where: {
        emailNormalized: { in: emails },
        eventId: { in: allowedEventIds },
        ...(query.status === 'all' ? {} : { revokedAt: query.status === 'revoked' ? { not: null } : null }),
      },
      include: { event: { select: eventSelection } },
      orderBy: [{ emailNormalized: 'asc' }, { eventId: 'asc' }, { createdAt: 'asc' }],
    }) : [];
    return { data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 } };
  }

  async eventsForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true, identities: { select: { provider: true, verifiedEmail: true, hostedDomain: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa.');
    }
    const institutional = user.email.endsWith('@ucb.edu.bo') && user.identities.some((identity) =>
      identity.provider === 'GOOGLE' && identity.verifiedEmail === user.email && identity.hostedDomain === 'ucb.edu.bo',
    );
    const events = institutional
      ? await this.prisma.event.findMany({ where: { slug: { in: DEFAULT_EVENT_SLUGS } }, select: eventSelection })
      : (await this.prisma.eventEmailAccess.findMany({
          where: { emailNormalized: user.email, revokedAt: null },
          select: { event: { select: eventSelection } },
        })).map(({ event }) => event);
    return { data: events };
  }

  async set(adminId: string, dto: SetEventAccessDto) {
    const email = normalizeEmail(dto.email);
    const { data: allowedEvents } = await this.eventsForUser(adminId);
    const allowedEventIds = new Set(allowedEvents.map(({ id }) => id));
    const requestedEventIds = dto.eventIds ?? [...allowedEventIds];
    if (!requestedEventIds.length) {
      throw new AppException(403, 'EVENT_ACCESS_DENIED', 'No administras ningún evento.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize scope replacements for the same email, including concurrent initial creates.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text AS locked`;
      const events = await tx.event.findMany({ where: { id: { in: requestedEventIds } }, select: { id: true } });
      if (events.length !== requestedEventIds.length) {
        throw new AppException(404, 'EVENT_NOT_FOUND', 'Uno o más eventos no están disponibles.');
      }
      const eventIds = events.map((event) => event.id);
      if (eventIds.some((eventId) => !allowedEventIds.has(eventId))) {
        throw new AppException(403, 'EVENT_ACCESS_DENIED', 'No administras uno o más eventos seleccionados.');
      }
      await tx.eventEmailAccess.updateMany({
        where: {
          emailNormalized: email,
          revokedAt: null,
          AND: [
            { eventId: { in: [...allowedEventIds] } },
            { eventId: { notIn: eventIds } },
          ],
        },
        data: { revokedAt: new Date() },
      });
      for (const eventId of eventIds) {
        await tx.eventEmailAccess.upsert({
          where: { emailNormalized_eventId: { emailNormalized: email, eventId } },
          create: { emailNormalized: email, eventId },
          update: { revokedAt: null },
        });
      }
      const data = await tx.eventEmailAccess.findMany({
        where: { emailNormalized: email, eventId: { in: eventIds }, revokedAt: null },
        include: { event: { select: eventSelection } },
        orderBy: { createdAt: 'asc' },
      });
      return { data };
    });
  }

  async revoke(id: string, adminId: string): Promise<void> {
    const authorization = await this.prisma.eventEmailAccess.findUnique({
      where: { id }, select: { eventId: true, revokedAt: true },
    });
    if (!authorization || authorization.revokedAt) {
      throw new AppException(404, 'NOT_FOUND', 'La autorización no existe o ya fue revocada.');
    }
    await this.assertEventIdAccess(adminId, authorization.eventId);
    await this.prisma.eventEmailAccess.update({
      where: { id }, data: { revokedAt: new Date() },
    });
  }
}
