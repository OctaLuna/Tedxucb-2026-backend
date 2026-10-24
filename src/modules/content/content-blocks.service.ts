import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { CreateContentBlockDto } from './dto/create-content-block.dto';
import { UpdateContentBlockDto } from './dto/update-content-block.dto';

/**
 * Sin auditoría (plan.md de 002 es explícito: solo se audita el Evento, no
 * los bloques de contenido) -- no agregar auditLog.create aquí.
 */
@Injectable()
export class ContentBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(eventSlug: string) {
    const event = await this.resolveEvent(eventSlug, true);
    return this.prisma.contentBlock.findMany({ where: { eventId: event.id }, orderBy: { key: 'asc' } });
  }

  async getByKey(key: string, eventSlug: string) {
    const event = await this.resolveEvent(eventSlug, true);
    const block = await this.prisma.contentBlock.findUnique({ where: { eventId_key: { eventId: event.id, key } } });
    if (!block) {
      throw new AppException(404, 'NOT_FOUND', 'Bloque de contenido no encontrado.');
    }
    return block;
  }

  async create(dto: CreateContentBlockDto, actorId: string) {
    const event = await this.resolveEvent(dto.eventSlug);
    try {
      return await this.prisma.contentBlock.create({
        data: { eventId: event.id, key: dto.key, title: dto.title, body: dto.body, updatedById: actorId },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'content_blocks_event_id_key_key')) {
        throw new AppException(409, 'DUPLICATE_KEY', 'Ya existe un bloque de contenido con esa clave.');
      }
      throw error;
    }
  }

  async update(key: string, dto: UpdateContentBlockDto, actorId: string, eventSlug: string) {
    const event = await this.resolveEvent(eventSlug);
    await this.getByKey(key, eventSlug);
    return this.prisma.contentBlock.update({
      where: { eventId_key: { eventId: event.id, key } },
      data: { title: dto.title, body: dto.body, updatedById: actorId },
    });
  }

  private async resolveEvent(slug: string, requirePublished = false) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event || (requirePublished && event.status !== 'PUBLISHED')) {
      throw new AppException(404, 'NOT_FOUND', 'Evento o contenido no encontrado.');
    }
    return event;
  }
}
