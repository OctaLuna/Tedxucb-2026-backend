import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { MailService } from '../../common/mail/mail.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { generateOpaqueToken } from '../../common/crypto/token-hash.util';
import { ManualSelectionDto } from './dto/manual-selection.dto';
import { EventAccessService } from '../event-access/event-access.service';

/**
 * Tras ADR-009: sin máquina de estados de invitación, sin lista de espera.
 * Una persona está seleccionada o no lo está; una entrada está usada o no.
 */
@Injectable()
export class SelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly mail: MailService,
    private readonly eventAccess: EventAccessService,
  ) {}

  /**
   * RF-402/403/404/408/409: ejecuta la selección de los mejores
   * posicionados del ranking real de `leaderboard` (003), congela
   * puntaje/posición, genera la entrada de cada uno -- todo en una sola
   * transacción, mismo rigor que el check-in de `003`.
   */
  async execute(actorId: string, eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findFirst({ where: { slug: eventSlug, status: 'PUBLISHED' } });
    if (!event) {
      throw new AppException(404, 'EVENT_NOT_CONFIGURED', 'No hay un evento publicado configurado.');
    }
    if (!event.studentCapacity) {
      throw new AppException(
        422,
        'CAPACITY_NOT_CONFIGURED',
        'El aforo estudiantil del evento no está configurado.',
      );
    }

    const activeRun = await this.prisma.selectionRun.findFirst({
      where: { eventId: event.id, revertedAt: null },
    });
    if (activeRun) {
      throw new AppException(409, 'SELECTION_ALREADY_ACTIVE', 'Ya existe una selección activa para este evento.', {
        runId: activeRun.id,
        executedAt: activeRun.executedAt,
      });
    }

    // Alguien podría ya tener una selección manual viva (p. ej. asignado
    // como invitado) y también rankear entre los mejores -- se lo excluye
    // de las plazas por ranking (one_active_selection_per_student no
    // admite duplicarlo) y se completa con el siguiente candidato.
    const alreadySelected = await this.prisma.selection.findMany({
      where: { eventId: event.id, revokedAt: null, studentId: { not: null } },
      select: { studentId: true },
    });
    const alreadySelectedIds = new Set(alreadySelected.map((s) => s.studentId));

    const candidates = await this.leaderboard.getLeaderboard({}, event.studentCapacity + alreadySelectedIds.size, eventSlug);
    const toSelect = candidates.data
      .filter((row) => !alreadySelectedIds.has(row.studentId))
      .slice(0, event.studentCapacity);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const run = await tx.selectionRun.create({
          data: { eventId: event.id, executedById: actorId, studentCapacitySnapshot: event.studentCapacity as number },
        });

        const created: Prisma.SelectionGetPayload<{ include: { student: { include: { user: true } } } }>[] = [];
        for (const row of toSelect) {
          const selection = await tx.selection.create({
            data: {
              eventId: event.id,
              runId: run.id,
              source: 'RANKING',
              studentId: row.studentId,
              audienceType: 'ESTUDIANTE',
              pointsAtSelection: row.totalPoints,
              rankAtSelection: row.position,
              entryCode: generateOpaqueToken(),
            },
            include: { student: { include: { user: true } } },
          });
          created.push(selection);
        }

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'SELECTION_EXECUTED',
            entityType: 'selection_run',
            entityId: run.id,
            detail: { studentCapacity: event.studentCapacity, selectedCount: created.length },
          },
        });

        return { run, created };
      });

      for (const selection of result.created) {
        this.mail
          .enqueueSelectionNotification({
            to: selection.student!.user.email,
            fullName: selection.student!.user.fullName,
            entryCode: selection.entryCode,
          })
          .catch(() => undefined);
      }

      return {
        runId: result.run.id,
        executedAt: result.run.executedAt.toISOString(),
        studentCapacity: event.studentCapacity,
        selectedCount: result.created.length,
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'one_active_selection_run_per_event')) {
        throw new AppException(409, 'SELECTION_ALREADY_ACTIVE', 'Ya existe una selección activa para este evento.');
      }
      throw error;
    }
  }

  /** RF-408: revierte la ejecución activa, marca sus selecciones vivas en cascada -- nunca borra (Artículo IV en espíritu). */
  async revert(reason: string | undefined, actorId: string, eventSlug = 'tedxucb') {
    this.assertReason(reason);

    const event = await this.prisma.event.findFirst({ where: { slug: eventSlug, status: 'PUBLISHED' } });
    const activeRun = event
      ? await this.prisma.selectionRun.findFirst({ where: { eventId: event.id, revertedAt: null } })
      : null;
    if (!activeRun) {
      throw new AppException(404, 'NOT_FOUND', 'No hay una selección activa para revertir.');
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.selectionRun.update({
        where: { id: activeRun.id },
        data: { revertedAt: now, revertedById: actorId, revertReason: reason },
      });

      const revoked = await tx.selection.updateMany({
        where: { runId: activeRun.id, revokedAt: null },
        data: { revokedAt: now, revokedById: actorId, revokedReason: `Selección revertida: ${reason}` },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'SELECTION_REVERTED',
          entityType: 'selection_run',
          entityId: activeRun.id,
          detail: { reason, revokedCount: revoked.count },
        },
      });

      return { runId: activeRun.id, revertedAt: now.toISOString(), revokedCount: revoked.count };
    });
  }

  /** RF-407a: resultado activo con distribución por carrera/facultad. */
  async getResult(eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findFirst({ where: { slug: eventSlug, status: 'PUBLISHED' } });
    const run = event
      ? await this.prisma.selectionRun.findFirst({
          where: { eventId: event.id, revertedAt: null },
          include: { executedBy: true },
        })
      : null;
    if (!run) {
      throw new AppException(404, 'NOT_FOUND', 'No hay una selección activa.');
    }

    const selections = await this.prisma.selection.findMany({
      where: { runId: run.id, revokedAt: null },
      include: { student: { include: { user: true, career: { include: { faculty: true } } } } },
      orderBy: { rankAtSelection: 'asc' },
    });

    const distributionMap = new Map<string, { career: string; faculty: string; count: number }>();
    for (const selection of selections) {
      if (!selection.student) continue;
      const key = selection.student.careerId;
      const entry = distributionMap.get(key) ?? {
        career: selection.student.career.name,
        faculty: selection.student.career.faculty.name,
        count: 0,
      };
      entry.count += 1;
      distributionMap.set(key, entry);
    }

    return {
      run: {
        id: run.id,
        executedAt: run.executedAt.toISOString(),
        executedBy: run.executedBy.fullName,
        studentCapacity: run.studentCapacitySnapshot,
      },
      data: selections.map((s) => ({
        selectionId: s.id,
        source: s.source,
        studentId: s.studentId,
        fullName: s.student?.user.fullName ?? s.fullName,
        career: s.student?.career.name,
        pointsAtSelection: s.pointsAtSelection,
        rankAtSelection: s.rankAtSelection,
        audienceType: s.audienceType,
        entryUsed: s.entryUsedAt !== null,
      })),
      distribution: Array.from(distributionMap.values()),
    };
  }

  /** RF-423: sin notificación proactiva -- el alumno mismo consulta si quedó seleccionado. */
  async getMyEntry(studentId: string, eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    const selection = await this.prisma.selection.findFirst({
      where: { studentId, eventId: event.id, revokedAt: null },
    });
    if (!selection) {
      return { selected: false as const };
    }
    return {
      selected: true as const,
      audienceType: selection.audienceType,
      entryCode: selection.entryCode,
      used: selection.entryUsedAt !== null,
    };
  }

  /** RF-420 y el caso límite de cubrir a mano un lugar liberado -- ADR-009 las trata como la misma operación. */
  async manualAssign(dto: ManualSelectionDto, actorId: string, eventSlug = 'tedxucb') {
    this.assertReason(dto.reason);

    let fullName = dto.fullName;
    let email = dto.email;

    if (dto.studentId) {
      const student = await this.prisma.studentProfile.findUnique({
        where: { userId: dto.studentId },
        include: { user: true },
      });
      if (!student) {
        throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
      }
      fullName = student.user.fullName;
      email = student.user.email;
    } else if (!fullName || !email) {
      throw new AppException(400, 'CONTACT_REQUIRED', 'Sin studentId, fullName y email son obligatorios.');
    }

    const event = await this.prisma.event.findFirst({ where: { slug: eventSlug, status: 'PUBLISHED' } });
    if (!event) throw new AppException(404, 'EVENT_NOT_CONFIGURED', 'No hay un evento publicado configurado.');
    if (dto.studentId) await this.eventAccess.assertEventAccess(dto.studentId, eventSlug);
    if (event?.capacity) {
      const activeCount = await this.prisma.selection.count({ where: { eventId: event.id, revokedAt: null } });
      if (activeCount + 1 > event.capacity) {
        throw new AppException(422, 'CAPACITY_EXCEEDED', 'Asignar este lugar excede el aforo total del evento.');
      }
    }

    try {
      const selection = await this.prisma.$transaction(async (tx) => {
        const created = await tx.selection.create({
          data: {
            eventId: event.id,
            source: 'MANUAL',
            studentId: dto.studentId,
            audienceType: dto.audienceType ?? (dto.studentId ? 'ESTUDIANTE' : 'INVITADO'),
            fullName: dto.studentId ? undefined : fullName,
            email: dto.studentId ? undefined : email,
            assignedById: actorId,
            reason: dto.reason,
            entryCode: generateOpaqueToken(),
          },
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'SELECTION_MANUAL_CREATED',
            entityType: 'selection',
            entityId: created.id,
            detail: { studentId: dto.studentId, audienceType: created.audienceType, reason: dto.reason },
          },
        });

        return created;
      });

      this.mail
        .enqueueSelectionNotification({ to: email as string, fullName: fullName as string, entryCode: selection.entryCode })
        .catch(() => undefined);

      return selection;
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'one_active_selection_per_student')) {
        throw new AppException(409, 'ALREADY_SELECTED', 'Este alumno ya tiene una selección activa.');
      }
      throw error;
    }
  }

  /** Libera el lugar de una persona ya seleccionada, sin revertir toda la ejecución. */
  async revokeSelection(id: string, reason: string | undefined, actorId: string, eventSlug = 'tedxucb') {
    this.assertReason(reason);

    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    const selection = await this.prisma.selection.findFirst({ where: { id, eventId: event.id } });
    if (!selection) {
      throw new AppException(404, 'NOT_FOUND', 'Selección no encontrada.');
    }
    if (selection.revokedAt) {
      throw new AppException(409, 'ALREADY_REVOKED', 'Ese lugar ya estaba liberado.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.selection.update({
        where: { id },
        data: { revokedAt: new Date(), revokedById: actorId, revokedReason: reason },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'SELECTION_REVOKED', entityType: 'selection', entityId: id, detail: { reason } },
      });
      return result;
    });

    return { id: updated.id, revokedAt: updated.revokedAt!.toISOString() };
  }

  /** RF-421: lista final de asistentes, CSV con BOM UTF-8 (mismo formato que LeaderboardService.exportCsv). */
  async exportCsv(actorId: string, eventSlug = 'tedxucb'): Promise<string> {
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    const selections = await this.prisma.selection.findMany({
      where: { eventId: event.id, revokedAt: null },
      include: { student: { include: { user: true, career: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const header = ['Nombre', 'Correo', 'Tipo', 'Carrera', 'Entrada usada'];
    const lines = selections.map((s) => [
      s.student?.user.fullName ?? s.fullName ?? '',
      s.student?.user.email ?? s.email ?? '',
      s.audienceType,
      s.student?.career.name ?? '',
      s.entryUsedAt ? 'Sí' : 'No',
    ]);

    await this.prisma.auditLog.create({
      data: { actorId, action: 'SELECTION_EXPORTED', entityType: 'selection', detail: { rowCount: selections.length } },
    });

    const csvRows = [header, ...lines].map((fields) => fields.map(this.csvField).join(','));
    return '﻿' + csvRows.join('\r\n');
  }

  private csvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private assertReason(reason: string | undefined): asserts reason is string {
    if (!reason || reason.trim().length === 0) {
      throw new AppException(400, 'REASON_REQUIRED', 'El motivo es obligatorio.');
    }
  }
}
