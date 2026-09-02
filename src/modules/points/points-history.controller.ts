import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PointsHistoryService } from './points-history.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PointsHistoryController {
  constructor(private readonly pointsHistoryService: PointsHistoryService) {}

  @Get('points')
  @Roles('ALUMNO')
  getMyPoints(
    @CurrentUser() user: AccessTokenPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.pointsHistoryService.getMyHistory(user.sub, Number(page) || 1, Number(limit) || 20);
  }
}
