import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';

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
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  async list(
    @Query('career') career?: string,
    @Query('faculty') faculty?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.studentsService.list({
      career,
      faculty,
      status,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="alumnos.csv"')
  async export(
    @Query('career') career: string | undefined,
    @Query('faculty') faculty: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.studentsService.exportCsv({ career, faculty, status, search }, actor.sub);
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.detail(id);
  }
}
