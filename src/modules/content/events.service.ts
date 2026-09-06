import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { UploadService } from '../../common/upload/upload.service';
import { UpdateEventDto } from './dto/update-event.dto';

export interface UploadedEventImageFile {
  buffer: Buffer;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * RF-204: "hora del servidor, no del dispositivo". Se devuelven startsAt
   * y serverTime, ambos calculados acá, para que el cliente reste contra
   * dos valores del servidor y nunca dependa de su propio reloj.
   */
  async getPublicSnapshot() {
    const event = await this.prisma.event.findFirst({ where: { status: 'PUBLISHED' } });
    if (!event) {
      throw new AppException(404, 'EVENT_NOT_CONFIGURED', 'No hay un evento publicado configurado.');
    }

    const serverTime = new Date();
    const eventStatus = serverTime >= event.startsAt ? 'FINISHED' : 'UPCOMING';

    return {
      event: {
        id: event.id,
        name: event.name,
        tagline: event.tagline,
        startsAt: event.startsAt.toISOString(),
        venue: event.venue,
        capacity: event.capacity,
        imageUrl: event.imageUrl,
      },
      serverTime: serverTime.toISOString(),
      eventStatus,
    };
  }

  /** En la práctica, una sola fila -- sin paginar (Artículo VI, plan.md de 002). */
  list() {
    return this.prisma.event.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async getById(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new AppException(404, 'NOT_FOUND', 'Evento no encontrado.');
    }
    return event;
  }

  async update(id: string, dto: UpdateEventDto, actorId: string) {
    await this.getById(id);

    const data: Record<string, unknown> = {
      name: dto.name,
      tagline: dto.tagline,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      venue: dto.venue,
      capacity: dto.capacity,
      studentCapacity: dto.studentCapacity,
      status: dto.status,
      updatedById: actorId,
    };

    try {
      const updated = await this.prisma.event.update({ where: { id }, data });
      await this.prisma.auditLog.create({
        data: { actorId, action: 'EVENT_UPDATED', entityType: 'event', entityId: id, detail: { ...dto } },
      });
      return updated;
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'one_published_event')) {
        throw new AppException(
          409,
          'ANOTHER_EVENT_ALREADY_PUBLISHED',
          'Ya existe otro evento publicado. Despublica el actual antes de publicar este.',
        );
      }
      throw error;
    }
  }

  /**
   * Mismo patrón que ProfileService.updateAvatar, vía el UploadService
   * compartido (sin recorte del lado del servidor -- ver plan.md de 002:
   * el encuadre de grilla lo resuelve el frontend).
   */
  async updateImage(
    id: string,
    file: UploadedEventImageFile | undefined,
    actorId: string,
  ): Promise<{ imageUrl: string }> {
    await this.getById(id);

    const imageUrl = await this.uploadService.upload('events', file?.buffer);
    await this.prisma.event.update({ where: { id }, data: { imageUrl, updatedById: actorId } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'EVENT_IMAGE_UPDATED', entityType: 'event', entityId: id, detail: { imageUrl } },
    });

    return { imageUrl };
  }
}
