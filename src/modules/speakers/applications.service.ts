import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, Speaker, SpeakerApplication } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { MailService } from '../../common/mail/mail.service';
import { resolveEventBySlug } from '../../common/events/resolve-event';
import type { PaginatedResult } from '../users/users.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

export interface ListApplicationsFilters {
  page: number;
  limit: number;
  status?: string;
  search?: string;
}

export interface ApplicationSummary extends SpeakerApplication {
  submissionsFromSameEmail: number;
}

export interface CreateApplicationResult {
  id: string;
  status: string;
  createdAt: string;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Señuelo (RF-212): si `website` llega con contenido, responde éxito sin
   * persistir nada ni encolar correo -- no delata al bot. La respuesta usa
   * un UUID real (no reconocible) para que la forma sea indistinguible de
   * una postulación genuina.
   */
  async create(dto: CreateApplicationDto, ip: string | undefined, eventSlug = 'tedxucb'): Promise<CreateApplicationResult> {
    if (dto.website && dto.website.trim().length > 0) {
      return { id: randomUUID(), status: 'PENDING', createdAt: new Date().toISOString() };
    }

    const event = await resolveEventBySlug(this.prisma, eventSlug, true);
    const application = await this.prisma.speakerApplication.create({
      data: {
        eventId: event.id,
        fullName: dto.fullName,
        email: dto.email,
        affiliation: dto.affiliation,
        expertiseArea: dto.expertiseArea,
        ideaTitle: dto.ideaTitle,
        ideaSummary: dto.ideaSummary,
        evidenceBasis: dto.evidenceBasis,
        applicability: dto.applicability,
        ipAddress: ip,
      },
    });

    // Encolado DESPUÉS de confirmar la escritura, nunca en la misma
    // transacción -- un fallo de Redis/SMTP no puede impedir el registro.
    await this.mailService.enqueueApplicationConfirmation({
      to: application.email,
      fullName: application.fullName,
      applicationId: application.id,
    });

    return {
      id: application.id,
      status: application.status,
      createdAt: application.createdAt.toISOString(),
    };
  }

  async list(filters: ListApplicationsFilters, eventSlug = 'tedxucb'): Promise<PaginatedResult<ApplicationSummary>> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const where = { ...this.buildWhere(filters), eventId: event.id };
    const [rows, total] = await Promise.all([
      this.prisma.speakerApplication.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.speakerApplication.count({ where }),
    ]);

    const uniqueEmails = [...new Set(rows.map((r) => r.email))];
    const counts = await Promise.all(
      uniqueEmails.map((email) =>
        this.prisma.speakerApplication.count({
          where: { eventId: event.id, email: { equals: email, mode: 'insensitive' } },
        }),
      ),
    );
    const countByEmail = new Map(uniqueEmails.map((email, i) => [email.toLowerCase(), counts[i]]));

    return {
      data: rows.map((row) => ({ ...row, submissionsFromSameEmail: countByEmail.get(row.email.toLowerCase())! })),
      meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) || 1 },
    };
  }

  async getById(id: string, eventSlug = 'tedxucb'): Promise<SpeakerApplication> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const application = await this.prisma.speakerApplication.findFirst({ where: { id, eventId: event.id } });
    if (!application) {
      throw new AppException(404, 'NOT_FOUND', 'Postulación no encontrada.');
    }
    return application;
  }

  /**
   * Máquina de estados: CONVERTED nunca se fija a mano (solo lo produce
   * convertToSpeaker) -- 422 INVALID_STATUS. Una postulación ya CONVERTED
   * es terminal para cambios de status -- 409 INVALID_STATUS_TRANSITION.
   * internalNotes solo, sin status, siempre permitido.
   */
  async update(id: string, dto: UpdateApplicationDto, actorId: string, eventSlug = 'tedxucb'): Promise<SpeakerApplication> {
    if (dto.status === 'CONVERTED') {
      throw new AppException(422, 'INVALID_STATUS', 'El estado CONVERTED solo lo produce el endpoint de conversión.');
    }

    const application = await this.getById(id, eventSlug);

    if (dto.status && application.status === 'CONVERTED') {
      throw new AppException(409, 'INVALID_STATUS_TRANSITION', 'Esta postulación ya fue convertida y no se puede reabrir.');
    }

    const data: Record<string, unknown> = { internalNotes: dto.internalNotes };
    let action = 'APPLICATION_NOTES_UPDATED';
    if (dto.status) {
      data.status = dto.status;
      data.reviewedById = actorId;
      data.reviewedAt = new Date();
      action =
        dto.status === 'ACCEPTED'
          ? 'APPLICATION_ACCEPTED'
          : dto.status === 'REJECTED'
            ? 'APPLICATION_REJECTED'
            : 'APPLICATION_MARKED_NOT_TED_FORMAT';
    }

    const updated = await this.prisma.speakerApplication.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: { actorId, action, entityType: 'speaker_application', entityId: id, detail: { ...dto } },
    });
    return updated;
  }

  /**
   * RF-215: crea el Speaker y marca la postulación CONVERTED en una sola
   * transacción. La garantía contra doble conversión concurrente vive en
   * la CONDICIÓN del UPDATE (updateMany where status='ACCEPTED'), no en un
   * SELECT previo -- mismo principio que el motor de puntos.
   */
  async convertToSpeaker(applicationId: string, actorId: string, eventSlug = 'tedxucb'): Promise<Speaker> {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.speakerApplication.findFirst({ where: { id: applicationId, eventId: event.id } });
      if (!application) {
        throw new AppException(404, 'NOT_FOUND', 'Postulación no encontrada.');
      }
      if (application.status !== 'ACCEPTED') {
        throw new AppException(409, 'INVALID_STATUS_TRANSITION', 'Solo se puede convertir una postulación aceptada.');
      }

      const speaker = await tx.speaker.create({
        data: {
          eventId: application.eventId,
          fullName: application.fullName,
          talkTitle: application.ideaTitle,
          headline: application.affiliation,
          bio: application.ideaSummary,
          status: 'DRAFT',
          createdById: actorId,
        },
      });

      // Update condicionado: si otra conversión concurrente ya cambió el
      // estado, count=0 y TODO se revierte -- incluido el Speaker recién
      // creado arriba (misma transacción).
      const result = await tx.speakerApplication.updateMany({
        where: { id: applicationId, status: 'ACCEPTED' },
        data: { status: 'CONVERTED', convertedSpeakerId: speaker.id },
      });

      if (result.count === 0) {
        throw new AppException(409, 'INVALID_STATUS_TRANSITION', 'Esta postulación ya fue convertida por otra acción.');
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'APPLICATION_CONVERTED',
          entityType: 'speaker_application',
          entityId: applicationId,
          detail: { speakerId: speaker.id },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'SPEAKER_CREATED',
          entityType: 'speaker',
          entityId: speaker.id,
          detail: { source: 'application', applicationId },
        },
      });

      return speaker;
    });
  }

  private buildWhere(filters: ListApplicationsFilters): Prisma.SpeakerApplicationWhereInput {
    const where: Prisma.SpeakerApplicationWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { ideaTitle: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

}
