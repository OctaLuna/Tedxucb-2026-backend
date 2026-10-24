import { Injectable } from '@nestjs/common';
import type { Activity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../../common/ledger/ledger.service';
import { AppException } from '../../common/exceptions/app.exception';
import type { PaginatedResult } from '../users/users.service';
import { ACTIVITY_STATUS, VALID_ACTIVITY_TRANSITIONS, type ActivityStatus } from './activities.constants';
import { resolveEventBySlug } from '../../common/events/resolve-event';
import { EventAccessService } from '../event-access/event-access.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

export interface ListActivitiesFilters {
  page: number;
  limit: number;
  status?: string;
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly eventAccess: EventAccessService,
  ) {}

  /**
   * RF-310c: el catálogo debe ser consultable por cualquier alumno antes de
   * participar. Para no-admin, el filtro de status del cliente se IGNORA
   * server-side: siempre PUBLISHED, sin importar lo que pida.
   */
  async list(filters: ListActivitiesFilters, isAdmin: boolean, eventSlug = 'tedxucb'): Promise<PaginatedResult<Activity>> {
    const event = await resolveEventBySlug(this.prisma, eventSlug, !isAdmin);
    const where = {
      eventId: event.id,
      ...(isAdmin && filters.status ? { status: filters.status } : !isAdmin ? { status: ACTIVITY_STATUS.PUBLISHED } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { category: true },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      data,
      meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) || 1 },
    };
  }

  async getById(id: string, isAdmin: boolean, eventSlug = 'tedxucb'): Promise<Activity> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const activity = await this.prisma.activity.findFirst({ where: { id, eventId: event.id }, include: { category: true } });
    if (!activity || (!isAdmin && activity.status !== ACTIVITY_STATUS.PUBLISHED)) {
      // No revela que existe una actividad DRAFT/CANCELLED a quien no es admin.
      throw new AppException(404, 'NOT_FOUND', 'Actividad no encontrada.');
    }
    return activity;
  }

  /** Para uso interno (check-in, guards): sin el filtro de visibilidad de getById. */
  async getByIdOrThrow(id: string, eventSlug?: string): Promise<Activity> {
    const event = eventSlug ? await resolveEventBySlug(this.prisma, eventSlug) : undefined;
    const activity = await this.prisma.activity.findFirst({ where: { id, ...(event ? { eventId: event.id } : {}) } });
    if (!activity) {
      throw new AppException(404, 'NOT_FOUND', 'Actividad no encontrada.');
    }
    return activity;
  }

  async create(dto: CreateActivityDto, actorId: string, eventSlug = 'tedxucb'): Promise<Activity> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    if (dto.categoryId) {
      const category = await this.prisma.activityCategory.findFirst({ where: { id: dto.categoryId, eventId: event.id } });
      if (!category) throw new AppException(422, 'INVALID_CATEGORY', 'La categoría no pertenece a este evento.');
    }
    const activity = await this.prisma.activity.create({
      data: {
        eventId: event.id,
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        location: dto.location,
        pointsValue: dto.pointsValue,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        checkinOpensAt: new Date(dto.checkinOpensAt),
        checkinClosesAt: new Date(dto.checkinClosesAt),
        allowMultipleCheckins: dto.allowMultipleCheckins ?? false,
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'ACTIVITY_CREATED', entityType: 'activity', entityId: activity.id, detail: { ...dto } },
    });
    return activity;
  }

  async update(id: string, dto: UpdateActivityDto, actorId: string, eventSlug = 'tedxucb'): Promise<Activity> {
    const current = await this.getByIdOrThrow(id, eventSlug);
    if (dto.categoryId) {
      const category = await this.prisma.activityCategory.findFirst({ where: { id: dto.categoryId, eventId: current.eventId } });
      if (!category) throw new AppException(422, 'INVALID_CATEGORY', 'La categoría no pertenece a este evento.');
    }

    if (dto.status && dto.status !== current.status) {
      this.assertTransition(current.status as ActivityStatus, dto.status as ActivityStatus);
    }

    const updated = await this.prisma.activity.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        location: dto.location,
        pointsValue: dto.pointsValue,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        checkinOpensAt: dto.checkinOpensAt ? new Date(dto.checkinOpensAt) : undefined,
        checkinClosesAt: dto.checkinClosesAt ? new Date(dto.checkinClosesAt) : undefined,
        allowMultipleCheckins: dto.allowMultipleCheckins,
        status: dto.status,
      },
      // Mismo include que list()/getById() -- auditoría T101, 003-d: el
      // PATCH devolvía la actividad sin category, la única inconsistencia
      // real de forma entre los tres endpoints que devuelven una Activity.
      include: { category: true },
    });

    const action =
      dto.status === ACTIVITY_STATUS.PUBLISHED
        ? 'ACTIVITY_PUBLISHED'
        : dto.status === ACTIVITY_STATUS.CLOSED
          ? 'ACTIVITY_CLOSED'
          : dto.pointsValue !== undefined && dto.pointsValue !== current.pointsValue
            ? 'ACTIVITY_VALUE_CHANGED'
            : 'ACTIVITY_UPDATED';

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'activity',
        entityId: id,
        detail:
          action === 'ACTIVITY_VALUE_CHANGED'
            ? { from: current.pointsValue, to: dto.pointsValue }
            : { ...dto },
      },
    });

    return updated;
  }

  /**
   * RF-308: cancela y, si revertPoints, revierte en bloque los movimientos
   * ACTIVITY de esta actividad que no tengan ya una reversión. El admin
   * decide explícitamente -- no hay default.
   */
  async cancel(id: string, actorId: string, revertPoints: boolean, eventSlug = 'tedxucb'): Promise<{ activityId: string; status: string; reversedCount: number }> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.findFirst({ where: { id, eventId: event.id } });
      if (!activity) {
        throw new AppException(404, 'NOT_FOUND', 'Actividad no encontrada.');
      }
      this.assertTransition(activity.status as ActivityStatus, ACTIVITY_STATUS.CANCELLED);

      await tx.activity.update({ where: { id }, data: { status: ACTIVITY_STATUS.CANCELLED } });

      let reversedCount = 0;
      if (revertPoints) {
        const toReverse = await tx.pointTransaction.findMany({
          where: { activityId: id, type: 'ACTIVITY', reversedBy: null },
        });
        for (const transaction of toReverse) {
          await this.ledger.reverseMovement(tx, transaction.id, {
            reason: 'Actividad cancelada por el administrador.',
            createdById: actorId,
          });
          reversedCount += 1;
        }
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ACTIVITY_CANCELLED',
          entityType: 'activity',
          entityId: id,
          detail: { revertPoints, reversedCount },
        },
      });

      return { activityId: id, status: ACTIVITY_STATUS.CANCELLED, reversedCount };
    });
  }

  /** RF-307: no se elimina con asistencias registradas -- ofrece cancelar. */
  async remove(id: string, eventSlug = 'tedxucb'): Promise<void> {
    await this.getByIdOrThrow(id, eventSlug);
    const attendanceCount = await this.prisma.attendance.count({ where: { activityId: id } });
    if (attendanceCount > 0) {
      throw new AppException(
        409,
        'ACTIVITY_HAS_ATTENDANCES',
        'No se puede eliminar: tiene asistencias registradas. Cancélala en su lugar.',
        { attendanceCount },
      );
    }
    await this.prisma.activity.delete({ where: { id } });
  }

  async listStaff(activityId: string, eventSlug = 'tedxucb') {
    await this.getByIdOrThrow(activityId, eventSlug);
    return this.prisma.activityStaff.findMany({
      where: { activityId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async assignStaff(activityId: string, userId: string, actorId: string, eventSlug = 'tedxucb') {
    const activity = await this.getByIdOrThrow(activityId, eventSlug);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!user) {
      throw new AppException(404, 'NOT_FOUND', 'Usuario no encontrado.');
    }
    const hasEligibleRole = user.roles.some((r) => r.role === 'STAFF' || r.role === 'ADMIN');
    if (!hasEligibleRole) {
      throw new AppException(422, 'INVALID_STAFF_ROLE', 'El usuario no tiene rol STAFF ni ADMIN.');
    }
    await this.eventAccess.assertEventIdAccess(user.id, activity.eventId);

    await this.prisma.activityStaff.upsert({
      where: { activityId_userId: { activityId, userId } },
      update: {},
      create: { activityId, userId, assignedById: actorId },
    });

    await this.prisma.auditLog.create({
      data: { actorId, action: 'STAFF_ASSIGNED', entityType: 'activity', entityId: activityId, detail: { userId } },
    });
  }

  async unassignStaff(activityId: string, userId: string, actorId: string, eventSlug = 'tedxucb'): Promise<void> {
    await this.getByIdOrThrow(activityId, eventSlug);
    await this.prisma.activityStaff.deleteMany({ where: { activityId, userId } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'STAFF_UNASSIGNED', entityType: 'activity', entityId: activityId, detail: { userId } },
    });
  }

  /** T093, CE-304: proporción de registros manuales frente a escaneados. */
  async getCheckinMetrics(eventSlug = 'tedxucb'): Promise<{ totalCheckins: number; manualCheckins: number; manualRatio: number }> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const [totalCheckins, manualCheckins] = await Promise.all([
      this.prisma.attendance.count({ where: { status: { not: 'REJECTED' }, activity: { eventId: event.id } } }),
      this.prisma.attendance.count({ where: { status: { not: 'REJECTED' }, method: 'MANUAL', activity: { eventId: event.id } } }),
    ]);
    return { totalCheckins, manualCheckins, manualRatio: totalCheckins > 0 ? manualCheckins / totalCheckins : 0 };
  }

  private assertTransition(current: ActivityStatus, next: ActivityStatus): void {
    if (!VALID_ACTIVITY_TRANSITIONS[current]?.includes(next)) {
      throw new AppException(409, 'INVALID_STATUS_TRANSITION', `No se puede pasar de ${current} a ${next}.`);
    }
  }
}
