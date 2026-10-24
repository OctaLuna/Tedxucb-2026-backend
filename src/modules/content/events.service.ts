import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { UploadService } from '../../common/upload/upload.service';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventAccessService } from '../event-access/event-access.service';

export interface UploadedEventImageFile {
  buffer: Buffer;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly eventAccess: EventAccessService,
  ) {}

  /**
   * RF-204: "hora del servidor, no del dispositivo". Se devuelven startsAt
   * y serverTime, ambos calculados acá, para que el cliente reste contra
   * dos valores del servidor y nunca dependa de su propio reloj.
   */
  async getPublicSnapshot(slug = 'tedxucb') {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event || event.status !== 'PUBLISHED') {
      throw new AppException(404, 'EVENT_NOT_CONFIGURED', 'No hay un evento publicado configurado.');
    }

    const serverTime = new Date();
    const eventStatus = serverTime >= event.startsAt ? 'FINISHED' : 'UPCOMING';

    return {
      event: {
        id: event.id,
        slug: event.slug,
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

  /** Lista solo los eventos a los que el administrador tiene scope activo. */
  async list(userId: string) {
    const { data: allowedEvents } = await this.eventAccess.eventsForUser(userId);
    return this.prisma.event.findMany({
      where: { id: { in: allowedEvents.map(({ id }) => id) } },
      orderBy: { createdAt: 'asc' },
    });
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

    const updated = await this.prisma.event.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'EVENT_UPDATED', entityType: 'event', entityId: id, detail: { ...dto } },
    });
    return updated;
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
