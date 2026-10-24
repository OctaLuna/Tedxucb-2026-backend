import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { EventAccessGuard } from '../event-access/event-access.guard';

/** RF-342 resuelto 2026-09-02: visible a cualquier autenticado, no solo ADMIN/STAFF. */
@ApiTags('leaderboard')
@ApiBearerAuth()
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @UseGuards(EventAccessGuard)
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week', description: 'Evento consultado; por omisión tedxucb.' })
  get(@Query() query: LeaderboardQueryDto, @Query('limit') limit?: string, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.leaderboardService.getLeaderboard(
      { career: query.career, faculty: query.faculty },
      Number(limit) || undefined,
      eventSlug,
    );
  }

  @Get('export')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week', description: 'Evento exportado; por omisión tedxucb.' })
  @UseGuards(RolesGuard, EventAccessGuard)
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ranking.csv"')
  export(@Query() query: LeaderboardQueryDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.leaderboardService.exportCsv({ career: query.career, faculty: query.faculty }, actor.sub, eventSlug);
  }
}
