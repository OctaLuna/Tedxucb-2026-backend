import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { CreateActivityCategoryDto } from './dto/create-activity-category.dto';
import { UpdateActivityCategoryDto } from './dto/update-activity-category.dto';

@Injectable()
export class ActivityCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.activityCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateActivityCategoryDto) {
    try {
      return await this.prisma.activityCategory.create({ data: dto });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'activity_categories_name_key')) {
        throw new AppException(409, 'DUPLICATE_CATEGORY', 'Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateActivityCategoryDto) {
    try {
      return await this.prisma.activityCategory.update({ where: { id }, data: dto });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'activity_categories_name_key')) {
        throw new AppException(409, 'DUPLICATE_CATEGORY', 'Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }
}
