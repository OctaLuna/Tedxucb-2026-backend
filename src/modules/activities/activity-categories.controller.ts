import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActivityCategoriesService } from './activity-categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateActivityCategoryDto } from './dto/create-activity-category.dto';
import { UpdateActivityCategoryDto } from './dto/update-activity-category.dto';

/** GET para cualquier autenticado (RF-310b/c); POST/PATCH exclusivo ADMIN. */
@ApiTags('activities')
@ApiBearerAuth()
@Controller('activity-categories')
@UseGuards(JwtAuthGuard)
export class ActivityCategoriesController {
  constructor(private readonly categoriesService: ActivityCategoriesService) {}

  @Get()
  list() {
    return this.categoriesService.list();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateActivityCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityCategoryDto) {
    return this.categoriesService.update(id, dto);
  }
}
