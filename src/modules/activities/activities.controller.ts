import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CancelActivityDto } from './dto/cancel-activity.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';

/**
 * RF-310c: el catálogo (GET) es visible a cualquier rol autenticado, no
 * solo ADMIN -- por eso el guard de clase es solo JwtAuthGuard, y
 * RolesGuard+@Roles('ADMIN') se agregan por método en las mutaciones.
 */
@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const isAdmin = user.roles.includes('ADMIN');
    return this.activitiesService.list({ page: Number(page) || 1, limit: Number(limit) || 20, status }, isAdmin);
  }

  // 'metrics' ANTES que ':id' -- Nest/Express matchean por orden de
  // registro, y ParseUUIDPipe convertiría esta ruta en un 400 si quedara
  // después (mismo criterio que 'export' antes de ':id' en
  // students.controller.ts, 001-d).
  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  metrics() {
    return this.activitiesService.getCheckinMetrics();
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.activitiesService.getById(id, user.roles.includes('ADMIN'));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateActivityDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.activitiesService.create(dto, actor.sub);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.activitiesService.update(id, dto, actor.sub);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelActivityDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.activitiesService.cancel(id, actor.sub, dto.revertPoints);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.activitiesService.remove(id);
  }

  @Get(':id/staff')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.listStaff(id);
  }

  @Post(':id/staff')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async assignStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStaffDto,
    @CurrentUser() actor: AccessTokenPayload,
  ): Promise<void> {
    await this.activitiesService.assignStaff(id, dto.userId, actor.sub);
  }

  @Delete(':id/staff/:userId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassignStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ): Promise<void> {
    await this.activitiesService.unassignStaff(id, userId, actor.sub);
  }
}
