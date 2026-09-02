import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** RF-329: historial completo del alumno, con la reversión visible junto al movimiento original. */
@Injectable()
export class PointsHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyHistory(studentId: string, page: number, limit: number) {
    const where = { studentId };

    const [rows, total, profile, activitiesAttended] = await Promise.all([
      this.prisma.pointTransaction.findMany({
        where,
        include: { activity: { select: { id: true, title: true } }, attendance: { select: { method: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pointTransaction.count({ where }),
      this.prisma.studentProfile.findUniqueOrThrow({ where: { userId: studentId } }),
      this.prisma.attendance.count({ where: { studentId } }),
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
      summary: { totalPoints: profile.totalPoints, activitiesAttended },
    };
  }
}
