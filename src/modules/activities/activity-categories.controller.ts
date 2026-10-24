import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActivityCategoriesService } from './activity-categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateActivityCategoryDto } from './dto/create-activity-category.dto';
import { UpdateActivityCategoryDto } from './dto/update-activity-category.dto';
import { EventAccessGuard } from '../event-access/event-access.guard';

/** GET para cualquier autenticado (RF-310b/c); POST/PATCH exclusivo ADMIN. */
@ApiTags('activities')
@ApiBearerAuth()
@Controller('activity-categories')
@UseGuards(JwtAuthGuard)
export class ActivityCategoriesController {
  constructor(private readonly categoriesService: ActivityCategoriesService) {}

  @Get()
  @UseGuards(EventAccessGuard)
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  list(@Query('eventSlug') eventSlug = 'tedxucb') {
    return this.categoriesService.list(eventSlug);
  }

  @Post()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @UseGuards(RolesGuard, EventAccessGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateActivityCategoryDto, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.categoriesService.create(dto, eventSlug);
  }

  @Patch(':id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @UseGuards(RolesGuard, EventAccessGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityCategoryDto, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.categoriesService.update(id, dto, eventSlug);
  }
}
