import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEventBySlug } from '../../common/events/resolve-event';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class ProgramEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, eventSlug: string) {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const rows = await this.prisma.programEnrollment.findMany({
      where: { userId, programItem: { eventId: event.id } },
      select: { programItemId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows };
  }

  async enroll(userId: string, programItemId: string, eventSlug: string) {
    const event = await resolveEventBySlug(this.prisma, eventSlug, true);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; type: string }>>`
        SELECT status, type FROM event_program_items
        WHERE id = ${programItemId}::uuid AND event_id = ${event.id}::uuid
        FOR UPDATE
      `;
      const item = rows[0];
      if (!item || item.status !== 'PUBLISHED') {
        throw new AppException(404, 'PROGRAM_ITEM_NOT_FOUND', 'La actividad no está disponible.');
      }
      if (item.type === 'BREAK') {
        throw new AppException(422, 'PROGRAM_ITEM_NOT_ENROLLABLE', 'Esta entrada no admite inscripciones.');
      }
      const enrollment = await tx.programEnrollment.upsert({
        where: { userId_programItemId: { userId, programItemId } },
        create: { userId, programItemId },
        update: {},
        select: { programItemId: true, createdAt: true },
      });
      return { data: enrollment };
    });
  }

  async cancel(userId: string, programItemId: string, eventSlug: string): Promise<void> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    await this.prisma.programEnrollment.deleteMany({
      where: { userId, programItemId, programItem: { eventId: event.id } },
    });
  }
}
