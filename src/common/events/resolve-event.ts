import type { Event } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

export async function resolveEventBySlug(
  prisma: Pick<PrismaService, 'event'>,
  slug: string,
  publishedOnly = false,
): Promise<Event> {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event || (publishedOnly && event.status !== 'PUBLISHED')) {
    throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
  }
  return event;
}