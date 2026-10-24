import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';

/** RF-329: historial completo del alumno, con la reversión visible junto al movimiento original. */
@Injectable()
export class PointsHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyHistory(studentId: string, page: number, limit: number, eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    const where = {
      studentId,
      OR: [
        { eventOwnership: { is: { eventId: event.id } } },
        ...(eventSlug === 'tedxucb' ? [{ eventOwnership: null }] : []),
      ],
    };

    const [rows, total, points, activitiesAttended] = await Promise.all([
      this.prisma.pointTransaction.findMany({
        where,
        include: { activity: { select: { id: true, title: true } }, attendance: { select: { method: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pointTransaction.count({ where }),
      this.prisma.eventStudentPoints.findUnique({
        where: { eventId_studentId: { eventId: event.id, studentId } }, select: { totalPoints: true },
      }),
      this.prisma.attendance.count({ where: { studentId, activity: { eventId: event.id } } }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        points: row.points,
        type: row.type,
        activity: row.activity ? { id: row.activity.id, title: row.activity.title } : null,
        reversesId: row.reversesId ?? undefined,
        reason: row.reason,
        method: row.attendance?.method,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
      summary: { totalPoints: points?.totalPoints ?? 0, activitiesAttended },
    };
  }
}
