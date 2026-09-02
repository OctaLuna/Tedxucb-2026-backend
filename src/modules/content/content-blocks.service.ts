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

  list() {
    return this.prisma.contentBlock.findMany({ orderBy: { key: 'asc' } });
  }

  async getByKey(key: string) {
    const block = await this.prisma.contentBlock.findUnique({ where: { key } });
    if (!block) {
      throw new AppException(404, 'NOT_FOUND', 'Bloque de contenido no encontrado.');
    }
    return block;
  }

  async create(dto: CreateContentBlockDto, actorId: string) {
    try {
      return await this.prisma.contentBlock.create({
        data: { key: dto.key, title: dto.title, body: dto.body, updatedById: actorId },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'content_blocks_key_key')) {
        throw new AppException(409, 'DUPLICATE_KEY', 'Ya existe un bloque de contenido con esa clave.');
      }
      throw error;
    }
  }

  async update(key: string, dto: UpdateContentBlockDto, actorId: string) {
    await this.getByKey(key);
    return this.prisma.contentBlock.update({
      where: { key },
      data: { title: dto.title, body: dto.body, updatedById: actorId },
    });
  }
}
