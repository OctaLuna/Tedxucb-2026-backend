import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/** RF-117. Acceso masivo a actividad de todas las cuentas -- exclusivo ADMIN. */
@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditLogController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.getAuditLog(Number(page) || 1, Number(limit) || 20, entityType, actorId);
  }
}
