import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PointsHistoryService } from './points-history.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { EventAccessGuard } from '../event-access/event-access.guard';

@ApiTags('points')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
export class PointsHistoryController {
  constructor(private readonly pointsHistoryService: PointsHistoryService) {}

  @Get('points')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week', description: 'Evento consultado; por omisión tedxucb.' })
  @Roles('ALUMNO')
  getMyPoints(
    @CurrentUser() user: AccessTokenPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.pointsHistoryService.getMyHistory(user.sub, Number(page) || 1, Number(limit) || 20, eventSlug);
  }
}
