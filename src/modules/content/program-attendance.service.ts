import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { resolveEventBySlug } from '../../common/events/resolve-event';
import { EventAccessService } from '../event-access/event-access.service';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;

@Injectable()
export class ProgramAttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly eventAccess: EventAccessService) {}

  private assertBizWeek(eventSlug: string) {
    if (eventSlug !== 'innovation-week') throw new AppException(403, 'EVENT_SCOPE_DENIED', 'Esta integración de asistencia solo está habilitada para BizWeek.');
  }

  async createLink(programItemId: string, actorId: string, eventSlug: string) {
    this.assertBizWeek(eventSlug);
    const event = await resolveEventBySlug(this.prisma, eventSlug, true);
    const item = await this.prisma.eventProgramItem.findFirst({ where: { id: programItemId, eventId: event.id } });
    if (!item || item.status !== 'PUBLISHED') throw new AppException(404, 'PROGRAM_ITEM_NOT_AVAILABLE', 'Solo se pueden generar enlaces para elementos publicados del cronograma.');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const link = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${programItemId}, 0))::text AS locked`;
      const previous = await tx.programAttendanceLink.updateMany({ where: { programItemId, revokedAt: null }, data: { revokedAt: new Date() } });
      const created = await tx.programAttendanceLink.create({ data: { programItemId, tokenHash, createdById: actorId } });
      await tx.auditLog.create({ data: { actorId, action: 'PROGRAM_ATTENDANCE_LINK_CREATED', entityType: 'program_attendance_link', entityId: created.id, detail: { eventId: event.id, programItemId, rotated: previous.count > 0 } } });
      return created;
    });
    return { data: { id: link.id, token, createdAt: link.createdAt } };
  }

  async revokeLink(programItemId: string, actorId: string, eventSlug: string) {
    this.assertBizWeek(eventSlug);
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const item = await this.prisma.eventProgramItem.findFirst({ where: { id: programItemId, eventId: event.id }, select: { id: true } });
    if (!item) throw new AppException(404, 'PROGRAM_ITEM_NOT_FOUND', 'Elemento del cronograma no encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.programAttendanceLink.updateMany({ where: { programItemId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId, action: 'PROGRAM_ATTENDANCE_LINK_REVOKED', entityType: 'event_program_item', entityId: programItemId, detail: { eventId: event.id, revokedLinks: result.count } } });
      return { data: { revoked: result.count > 0 } };
    });
  }

  async adminList(programItemId: string, eventSlug: string) {
    this.assertBizWeek(eventSlug);
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const item = await this.prisma.eventProgramItem.findFirst({ where: { id: programItemId, eventId: event.id }, select: { id: true, title: true, status: true, startsAt: true, endsAt: true } });
    if (!item) throw new AppException(404, 'PROGRAM_ITEM_NOT_FOUND', 'Elemento del cronograma no encontrado.');
    const [link, enrollments, attendances] = await Promise.all([
      this.prisma.programAttendanceLink.findFirst({ where: { programItemId, revokedAt: null }, select: { id: true, createdAt: true } }),
      this.prisma.programEnrollment.findMany({ where: { programItemId }, select: { createdAt: true, user: { select: { id: true, nickname: true, fullName: true, email: true } } } }),
      this.prisma.programAttendance.findMany({ where: { programItemId }, select: { id: true, checkedInAt: true, method: true, user: { select: { id: true, nickname: true, fullName: true, email: true } } } }),
    ]);
    const byUser = new Map<string, { user: typeof enrollments[number]['user']; enrolledAt: Date | null; attendedAt: Date | null; method: string | null }>();
    for (const enrollment of enrollments) byUser.set(enrollment.user.id, { user: enrollment.user, enrolledAt: enrollment.createdAt, attendedAt: null, method: null });
    for (const attendance of attendances) {
      const current = byUser.get(attendance.user.id);
      byUser.set(attendance.user.id, { user: attendance.user, enrolledAt: current?.enrolledAt ?? null, attendedAt: attendance.checkedInAt, method: attendance.method });
    }
    const now = new Date();
    const rows = [...byUser.values()].map(({ user, enrolledAt, attendedAt, method }) => ({
      userId: user.id,
      nickname: user.nickname,
      name: user.fullName,
      email: user.email,
      enrolledAt,
      attendedAt,
      method,
      status: attendedAt ? 'ATTENDED' : enrolledAt && now >= item.endsAt ? 'ABSENT' : enrolledAt ? 'ENROLLED' : 'ATTENDED_WITHOUT_ENROLLMENT',
    })).sort((a, b) => (a.attendedAt?.getTime() ?? a.enrolledAt?.getTime() ?? 0) - (b.attendedAt?.getTime() ?? b.enrolledAt?.getTime() ?? 0));
    return { data: { item, link: link ? { active: true, createdAt: link.createdAt } : { active: false, createdAt: null }, summary: {
      attended: attendances.length,
      attendedWithoutEnrollment: rows.filter((row) => row.attendedAt && !row.enrolledAt).length,
      enrolledAbsent: rows.filter((row) => row.status === 'ABSENT').length,
      enrolledPending: rows.filter((row) => row.status === 'ENROLLED').length,
    }, participants: rows } };
  }

  async myProgramStatus(userId: string, eventSlug: string) {
    const event = await resolveEventBySlug(this.prisma, eventSlug, true);
    await this.eventAccess.assertEventAccess(userId, eventSlug);
    const items = await this.prisma.eventProgramItem.findMany({
      where: { eventId: event.id, status: { in: ['PUBLISHED', 'CANCELLED'] } },
      orderBy: [{ startsAt: 'asc' }, { displayOrder: 'asc' }],
      select: {
        id: true, title: true, description: true, type: true, status: true, startsAt: true, endsAt: true,
        enrollments: { where: { userId }, select: { createdAt: true }, take: 1 },
        attendances: { where: { userId }, select: { checkedInAt: true, method: true }, take: 1 },
      },
    });
    const now = new Date();
    return { data: items.map(({ enrollments, attendances, ...item }) => {
      const enrolledAt = enrollments[0]?.createdAt ?? null;
      const attendance = attendances[0] ?? null;
      const state = attendance ? 'ATTENDED' : item.status === 'CANCELLED' ? 'CANCELLED' : enrolledAt ? now >= item.endsAt ? 'ENROLLED_NO_ATTENDANCE' : 'ENROLLED' : 'NOT_ENROLLED';
      return { ...item, enrolled: Boolean(enrolledAt), enrolledAt, attendedAt: attendance?.checkedInAt ?? null, method: attendance?.method ?? null, state };
    }) };
  }

  async preview(userId: string, token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new AppException(404, 'ATTENDANCE_LINK_INVALID', 'El enlace de asistencia no es válido.');
    const link = await this.prisma.programAttendanceLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { programItem: { include: { event: { select: { slug: true, status: true } } } } } });
    if (!link) throw new AppException(404, 'ATTENDANCE_LINK_INVALID', 'El enlace de asistencia no es válido.');
    if (link.revokedAt) throw new AppException(410, 'ATTENDANCE_LINK_REVOKED', 'Este enlace fue revocado. Solicita al equipo organizador uno vigente.');
    const item = link.programItem;
    if (item.event.slug !== 'innovation-week') throw new AppException(404, 'ATTENDANCE_LINK_INVALID', 'El enlace de asistencia no es válido.');
    await this.eventAccess.assertEventAccess(userId, item.event.slug);
    if (item.status === 'CANCELLED') throw new AppException(409, 'PROGRAM_ITEM_CANCELLED', 'Esta actividad fue cancelada y no admite confirmaciones.');
    if (item.status !== 'PUBLISHED' || item.event.status !== 'PUBLISHED') throw new AppException(404, 'PROGRAM_ITEM_NOT_AVAILABLE', 'Este elemento del cronograma no está disponible.');
    const existing = await this.prisma.programAttendance.findUnique({ where: { userId_programItemId: { userId, programItemId: item.id } }, select: { checkedInAt: true } });
    return { data: { item: { id: item.id, title: item.title, startsAt: item.startsAt, endsAt: item.endsAt }, alreadyConfirmed: Boolean(existing), checkedInAt: existing?.checkedInAt ?? null } };
  }

  async confirm(userId: string, token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new AppException(404, 'ATTENDANCE_LINK_INVALID', 'El enlace de asistencia no es válido.');
    const link = await this.prisma.programAttendanceLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { programItem: { include: { event: { select: { slug: true, status: true } } } } },
    });
    if (!link) throw new AppException(404, 'ATTENDANCE_LINK_INVALID', 'El enlace de asistencia no es válido.');
    if (link.revokedAt) throw new AppException(410, 'ATTENDANCE_LINK_REVOKED', 'Este enlace fue revocado. Solicita al equipo organizador uno vigente.');
    const item = link.programItem;
    if (item.event.slug !== 'innovation-week') throw new AppException(404, 'ATTENDANCE_LINK_INVALID', 'El enlace de asistencia no es válido.');
    await this.eventAccess.assertEventAccess(userId, item.event.slug);
    if (item.status === 'CANCELLED') throw new AppException(409, 'PROGRAM_ITEM_CANCELLED', 'Esta actividad fue cancelada y no admite confirmaciones.');
    if (item.status !== 'PUBLISHED' || item.event.status !== 'PUBLISHED') throw new AppException(404, 'PROGRAM_ITEM_NOT_AVAILABLE', 'Este elemento del cronograma no está disponible.');
    const existing = await this.prisma.programAttendance.findUnique({ where: { userId_programItemId: { userId, programItemId: item.id } } });
    if (existing) return { data: { attendance: existing, item: { id: item.id, title: item.title }, alreadyConfirmed: true } };
    try {
      const attendance = await this.prisma.programAttendance.create({ data: { userId, programItemId: item.id, method: 'NFC_LINK' } });
      return { data: { attendance, item: { id: item.id, title: item.title }, alreadyConfirmed: false } };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const attendance = await this.prisma.programAttendance.findUnique({ where: { userId_programItemId: { userId, programItemId: item.id } } });
        if (attendance) return { data: { attendance, item: { id: item.id, title: item.title }, alreadyConfirmed: true } };
      }
      throw error;
    }
  }
}
