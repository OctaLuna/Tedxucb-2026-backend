import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { CreateActivityCategoryDto } from './dto/create-activity-category.dto';
import { UpdateActivityCategoryDto } from './dto/update-activity-category.dto';
import { resolveEventBySlug } from '../../common/events/resolve-event';

@Injectable()
export class ActivityCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    return this.prisma.activityCategory.findMany({ where: { eventId: event.id }, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateActivityCategoryDto, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    try {
      return await this.prisma.activityCategory.create({ data: { ...dto, eventId: event.id } });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'activity_categories_event_id_name_key')) {
        throw new AppException(409, 'DUPLICATE_CATEGORY', 'Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateActivityCategoryDto, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const existing = await this.prisma.activityCategory.findFirst({ where: { id, eventId: event.id } });
    if (!existing) {
      throw new AppException(404, 'NOT_FOUND', 'Categoría no encontrada.');
    }
    try {
      return await this.prisma.activityCategory.update({ where: { id }, data: dto });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'activity_categories_event_id_name_key')) {
        throw new AppException(409, 'DUPLICATE_CATEGORY', 'Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }
}
