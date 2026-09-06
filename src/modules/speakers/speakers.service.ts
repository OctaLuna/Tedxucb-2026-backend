import { Injectable } from '@nestjs/common';
import type { Speaker } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { UploadService } from '../../common/upload/upload.service';
import type { PaginatedResult } from '../users/users.service';
import { CreateSpeakerDto } from './dto/create-speaker.dto';
import { UpdateSpeakerDto } from './dto/update-speaker.dto';

export interface ListSpeakersFilters {
  page: number;
  limit: number;
}

export interface UploadedSpeakerPhotoFile {
  buffer: Buffer;
}

const REQUIRED_TO_PUBLISH = ['headline', 'bio', 'talkTitle', 'photoUrl', 'photoAltText'] as const;

@Injectable()
export class SpeakersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  /** RF-207/RF-208: solo PUBLISHED, ordenados. Sin paginar (colección acotada). */
  listPublic() {
    return this.prisma.speaker.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async list(filters: ListSpeakersFilters): Promise<PaginatedResult<Speaker>> {
    const [data, total] = await Promise.all([
      this.prisma.speaker.findMany({
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.speaker.count(),
    ]);
    return {
      data,
      meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) || 1 },
    };
  }

  async getById(id: string): Promise<Speaker> {
    const speaker = await this.prisma.speaker.findUnique({ where: { id } });
    if (!speaker) {
      throw new AppException(404, 'NOT_FOUND', 'Speaker no encontrado.');
    }
    return speaker;
  }

  async create(dto: CreateSpeakerDto, actorId: string): Promise<Speaker> {
    const speaker = await this.prisma.speaker.create({
      data: {
        fullName: dto.fullName,
        headline: dto.headline,
        bio: dto.bio,
        talkTitle: dto.talkTitle,
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'SPEAKER_CREATED', entityType: 'speaker', entityId: speaker.id, detail: { ...dto } },
    });
    return speaker;
  }

  /**
   * Traduce el CHECK published_speaker_is_complete a 422 INCOMPLETE_SPEAKER
   * con details.missingFields. Pre-check en el servicio (da un mensaje útil
   * que el error crudo de Postgres no puede dar) + catch de segunda capa
   * sobre el CHECK real (defensa de condición de carrera).
   */
  async update(id: string, dto: UpdateSpeakerDto, actorId: string): Promise<Speaker> {
    const current = await this.getById(id);
    // class-transformer materializa TODAS las propiedades declaradas del DTO
    // como claves presentes (con valor undefined si no vinieron en el JSON)
    // -- spread directo pisaría los valores actuales con undefined. Solo se
    // fusionan las claves realmente enviadas.
    const definedDtoFields = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
    const merged = { ...current, ...definedDtoFields } as Record<string, unknown>;
    const targetStatus = dto.status ?? current.status;

    if (targetStatus === 'PUBLISHED') {
      const missing = this.missingFields(merged);
      if (missing.length > 0) {
        throw new AppException(422, 'INCOMPLETE_SPEAKER', 'No se puede publicar: faltan campos obligatorios.', {
          missingFields: missing,
        });
      }
    }

    try {
      const updated = await this.prisma.speaker.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          headline: dto.headline,
          bio: dto.bio,
          talkTitle: dto.talkTitle,
          photoAltText: dto.photoAltText,
          status: dto.status,
        },
      });
      const statusChanged = dto.status && dto.status !== current.status;
      const action = statusChanged
        ? dto.status === 'PUBLISHED'
          ? 'SPEAKER_PUBLISHED'
          : 'SPEAKER_UNPUBLISHED'
        : 'SPEAKER_UPDATED';
      await this.prisma.auditLog.create({
        data: { actorId, action, entityType: 'speaker', entityId: id, detail: { ...dto } },
      });
      return updated;
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'published_speaker_is_complete')) {
        throw new AppException(422, 'INCOMPLETE_SPEAKER', 'No se puede publicar: faltan campos obligatorios.', {
          missingFields: this.missingFields(merged),
        });
      }
      throw error;
    }
  }

  /** Mismo patrón exacto que EventsService.updateImage/ProfileService.updateAvatar, vía UploadService. */
  async updatePhoto(
    id: string,
    file: UploadedSpeakerPhotoFile | undefined,
    actorId: string,
  ): Promise<{ photoUrl: string }> {
    await this.getById(id); // 404 si no existe

    const photoUrl = await this.uploadService.upload('speakers', file?.buffer);
    await this.prisma.speaker.update({ where: { id }, data: { photoUrl } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'SPEAKER_PHOTO_UPDATED', entityType: 'speaker', entityId: id, detail: { photoUrl } },
    });

    return { photoUrl };
  }

  /** POST /speakers/reorder: la lista debe ser el universo completo de ids existentes. */
  async reorder(ids: string[], actorId: string): Promise<void> {
    const providedSet = new Set(ids);
    if (providedSet.size !== ids.length) {
      throw new AppException(400, 'VALIDATION_ERROR', 'La lista contiene ids repetidos.');
    }

    const existing = await this.prisma.speaker.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((s) => s.id));

    const unknownIds = ids.filter((id) => !existingIds.has(id));
    const missingIds = [...existingIds].filter((id) => !providedSet.has(id));
    if (unknownIds.length > 0 || missingIds.length > 0) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'La lista debe incluir exactamente todos los speakers actuales, sin ids ajenos.',
        { unknownIds, missingIds },
      );
    }

    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.speaker.update({ where: { id }, data: { displayOrder: index } })),
    );

    await this.prisma.auditLog.create({
      data: { actorId, action: 'SPEAKERS_REORDERED', entityType: 'speaker', detail: { order: ids } },
    });
  }

  private missingFields(merged: Record<string, unknown>): string[] {
    return REQUIRED_TO_PUBLISH.filter((field) => {
      const value = merged[field];
      return value == null || (typeof value === 'string' && value.trim().length === 0);
    });
  }
}
