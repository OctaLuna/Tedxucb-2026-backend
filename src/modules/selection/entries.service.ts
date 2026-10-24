import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';

/** RF-416 a RF-419: control de acceso el día del evento. */
@Injectable()
export class EntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RF-417: verificación en el servidor, un solo uso. La garantía real
   * vive en la condición del UPDATE (WHERE entry_used_at IS NULL), no en
   * un SELECT previo -- mismo principio que
   * ApplicationsService.convertToSpeaker (002) y el check-in de `003`.
   */
  async scan(entryCode: string, staffId: string, eventSlug = 'tedxucb') {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({ where: { slug: eventSlug }, select: { id: true } });
      if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
      const selection = await tx.selection.findUnique({
        where: { entryCode },
        include: { student: { include: { user: true } }, entryValidatedBy: true },
      });
      if (!selection || selection.eventId !== event.id || selection.revokedAt) {
        throw new AppException(404, 'INVALID_ENTRY', 'El código no corresponde a ninguna entrada válida.');
      }

      const result = await tx.selection.updateMany({
        where: { id: selection.id, entryUsedAt: null },
        data: { entryUsedAt: new Date(), entryValidatedById: staffId },
      });

      if (result.count === 0) {
        throw new AppException(409, 'ALREADY_USED', 'Esta entrada ya fue utilizada.', {
          usedAt: selection.entryUsedAt,
          validatedBy: selection.entryValidatedBy?.fullName,
        });
      }

      return {
        fullName: selection.student?.user.fullName ?? selection.fullName,
        audienceType: selection.audienceType,
        enteredAt: new Date().toISOString(),
      };
    });
  }

  /** RF-419: aforo ocupado en tiempo real. */
  async liveCount(eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findFirst({ where: { slug: eventSlug, status: 'PUBLISHED' } });

    const [entered, studentsEntered] = await Promise.all([
      this.prisma.selection.count({ where: { eventId: event?.id, revokedAt: null, entryUsedAt: { not: null } } }),
      this.prisma.selection.count({
        where: { eventId: event?.id, revokedAt: null, entryUsedAt: { not: null }, source: 'RANKING' },
      }),
    ]);

    return {
      totalCapacity: event?.capacity ?? null,
      entered,
      studentCapacity: event?.studentCapacity ?? null,
      studentsEntered,
    };
  }
}
