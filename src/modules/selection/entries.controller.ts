import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EntriesService } from './entries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ScanEntryDto } from './dto/scan-entry.dto';
import { EventAccessGuard } from '../event-access/event-access.guard';

@ApiTags('selection')
@ApiBearerAuth()
@Controller('entries')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  /**
   * A diferencia del check-in de `003`, sin asignación explícita por
   * actividad: un solo punto de control en la puerta, no docenas de
   * actividades paralelas -- cualquier STAFF/ADMIN autenticado puede
   * validar (contracts/seleccion.md).
   */
  @Post('scan')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @Roles('STAFF', 'ADMIN')
  scan(@Body() dto: ScanEntryDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.entriesService.scan(dto.entryCode, actor.sub, eventSlug);
  }

  @Get('live')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @Roles('ADMIN')
  live(@Query('eventSlug') eventSlug = 'tedxucb') {
    return this.entriesService.liveCount(eventSlug);
  }
}
