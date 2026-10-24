import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { EventAccessGuard } from '../event-access/event-access.guard';

@ApiTags('leaderboard')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
export class MeProgressController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('progress')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week', description: 'Evento consultado; por omisión tedxucb.' })
  @Roles('ALUMNO')
  getMyProgress(@CurrentUser() user: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.leaderboardService.getStudentProgress(user.sub, eventSlug);
  }
}
