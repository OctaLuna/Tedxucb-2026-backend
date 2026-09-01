import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { RejectRegistrationDto } from './dto/reject-registration.dto';

/**
 * Revisión manual de registros pendientes (ADR-007, RF-126) -- la barrera
 * antifraude central desde que no existe padrón institucional.
 *
 * Nota para 001-d: `profiles` va a declarar su propio `@Controller('students')`
 * para GET / (listado), GET /:id (detalle) y GET /export -- rutas estáticas
 * ('pending') y dinámicas (':id') conviven sin colisión siempre que 'pending'
 * no quede eclipsado por un ':id' registrado antes; revisar el orden de
 * imports en users.module.ts / profiles.module.ts si se mueve algo de sitio.
 */
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class StudentsReviewController {
  constructor(private readonly usersService: UsersService) {}

  @Get('pending')
  async pending(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.usersService.listPendingStudents(Number(page) || 1, Number(limit) || 20);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @CurrentUser() actor: AccessTokenPayload) {
    return this.usersService.approveStudent(id, actor.sub);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectRegistrationDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.usersService.rejectStudent(id, dto.reason, actor.sub);
  }
}
