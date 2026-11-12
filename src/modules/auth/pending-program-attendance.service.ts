import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../../common/ledger/ledger.service';

@Injectable()
export class PendingProgramAttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async claimForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, roles: { select: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE' || !user.roles.some(({ role }) => role === 'ALUMNO')) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))::text AS locked`;
      const claims = await tx.pendingProgramAttendanceClaim.findMany({
        where: {
          emailNormalized: user.email.toLowerCase(),
          status: 'PENDING',
          programItem: { event: { slug: 'innovation-week' } },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const claim of claims) {
        const item = await tx.eventProgramItem.findUnique({
          where: { id: claim.programItemId },
          include: { event: { select: { id: true, slug: true } }, activity: true },
        });
        if (!item || item.event.slug !== 'innovation-week') continue;
        if (claim.attendancePoints > 0 && !item.activity) {
          throw new Error(`Missing points activity for pending program item ${item.id}`);
        }

        const existing = await tx.programAttendance.findUnique({
          where: { userId_programItemId: { userId, programItemId: item.id } },
        });
        const attendance = existing ?? await tx.programAttendance.create({
          data: { userId, programItemId: item.id, method: 'MANUAL_ROSTER' },
        });

        if (claim.attendancePoints > 0 && item.activity) {
          const idempotencyKey = `checkin:${item.activity.id}:${userId}`;
          const existingAward = await tx.pointTransaction.findUnique({
            where: { idempotencyKey }, select: { id: true },
          });
          if (!existingAward) {
            const movement = await this.ledger.recordMovement(tx, {
              eventId: item.event.id,
              studentId: userId,
              points: claim.attendancePoints,
              type: 'ACTIVITY',
              activityId: item.activity.id,
              programAttendanceId: attendance.id,
              idempotencyKey,
              reason: 'Asistencia manual importada desde la lista del evento',
            });
            await tx.programAttendanceNotification.create({
              data: { userId, programItemId: item.id, kind: 'ATTENDANCE', points: movement.points },
            });
          }
        }

        if (claim.exhibitorBonusPoints > 0) {
          const idempotencyKey = `program-attendance-exhibitor:${item.id}:${userId}`;
          const existingBonus = await tx.pointTransaction.findUnique({
            where: { idempotencyKey }, select: { id: true },
          });
          if (!existingBonus) {
            const movement = await this.ledger.recordMovement(tx, {
              eventId: item.event.id,
              studentId: userId,
              points: claim.exhibitorBonusPoints,
              type: 'BONUS',
              reason: `Bono de expositor por asistencia a ${item.title} (${item.id})`,
              idempotencyKey,
            });
            await tx.programAttendanceNotification.create({
              data: { userId, programItemId: item.id, kind: 'EXHIBITOR', points: movement.points },
            });
          }
        }

        await tx.pendingProgramAttendanceClaim.update({
          where: { id: claim.id },
          data: { status: 'CLAIMED', claimedById: userId, claimedAt: new Date() },
        });
      }
    });
  }

  async listUnacknowledged(userId: string) {
    await this.claimForUser(userId);
    const notifications = await this.prisma.programAttendanceNotification.findMany({
      where: { userId, acknowledgedAt: null },
      include: { programItem: { select: { title: true } } },
      orderBy: [{ createdAt: 'asc' }, { kind: 'asc' }],
    });
    return {
      data: notifications.map(({ id, kind, points, createdAt, programItem }) => ({
        id, kind, points, createdAt, itemTitle: programItem.title,
      })),
    };
  }

  async acknowledge(userId: string, notificationId: string) {
    const result = await this.prisma.programAttendanceNotification.updateMany({
      where: { id: notificationId, userId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
    return { data: { acknowledged: result.count === 1 } };
  }
}
