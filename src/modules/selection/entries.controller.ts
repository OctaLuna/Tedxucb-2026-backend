import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntriesService } from './entries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ScanEntryDto } from './dto/scan-entry.dto';

@ApiTags('selection')
@ApiBearerAuth()
@Controller('entries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  /**
   * A diferencia del check-in de `003`, sin asignación explícita por
   * actividad: un solo punto de control en la puerta, no docenas de
   * actividades paralelas -- cualquier STAFF/ADMIN autenticado puede
   * validar (contracts/seleccion.md).
   */
  @Post('scan')
  @Roles('STAFF', 'ADMIN')
  scan(@Body() dto: ScanEntryDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.entriesService.scan(dto.entryCode, actor.sub);
  }

  @Get('live')
  @Roles('ADMIN')
  live() {
    return this.entriesService.liveCount();
  }
}
