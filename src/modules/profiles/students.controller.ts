import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { EventAccessGuard } from '../event-access/event-access.guard';

/**
 * `users` ya declara @Controller('students') con GET 'pending' y POST
 * ':id/approve'|'reject' (ver students-review.controller.ts). Este
 * controlador, de otro módulo, agrega GET '', GET 'export', GET ':id'.
 *
 * Defensa de rutas en 3 capas contra que ':id' eclipse 'pending'/'export'
 * de OTRO controlador (Nest/Express matchean por orden de registro):
 *   1. ProfilesModule se importa DESPUÉS de UsersModule en app.module.ts.
 *   2. Dentro de ESTA clase, 'export' se declara antes que ':id'.
 *   3. ParseUUIDPipe en ':id' -- si el orden entre módulos se rompiera,
 *      esto convierte una colisión en 400 inmediato, no en un 500 de
 *      Prisma intentando resolver 'pending'/'export' como UUID.
 * Una prueba de integración cubre que /students/pending sigue
 * respondiendo lo de `users` (ver tests/integration/profiles-routing...).
 */
@ApiTags('profiles')
@ApiBearerAuth()
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
@Roles('ADMIN')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  async list(
    @Query('career') career?: string,
    @Query('faculty') faculty?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.studentsService.list({
      career,
      faculty,
      status,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      eventSlug,
    });
  }

  @Get('export')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="alumnos.csv"')
  async export(
    @Query('career') career: string | undefined,
    @Query('faculty') faculty: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentUser() actor: AccessTokenPayload,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.studentsService.exportCsv({ career, faculty, status, search, eventSlug }, actor.sub);
  }

  @Get(':id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  async detail(@Param('id', ParseUUIDPipe) id: string, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.studentsService.detail(id, eventSlug);
  }
}
