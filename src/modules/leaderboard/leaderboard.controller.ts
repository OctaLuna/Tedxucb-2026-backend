import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

/** RF-342 resuelto 2026-09-02: visible a cualquier autenticado, no solo ADMIN/STAFF. */
@ApiTags('leaderboard')
@ApiBearerAuth()
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  get(@Query() query: LeaderboardQueryDto, @Query('limit') limit?: string) {
    return this.leaderboardService.getLeaderboard(
      { career: query.career, faculty: query.faculty },
      Number(limit) || undefined,
    );
  }

  @Get('export')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ranking.csv"')
  export(@Query() query: LeaderboardQueryDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.leaderboardService.exportCsv({ career: query.career, faculty: query.faculty }, actor.sub);
  }
}
