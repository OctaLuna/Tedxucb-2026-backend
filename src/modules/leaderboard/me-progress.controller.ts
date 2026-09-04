import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';

@ApiTags('leaderboard')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeProgressController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('progress')
  @Roles('ALUMNO')
  getMyProgress(@CurrentUser() user: AccessTokenPayload) {
    return this.leaderboardService.getStudentProgress(user.sub);
  }
}
