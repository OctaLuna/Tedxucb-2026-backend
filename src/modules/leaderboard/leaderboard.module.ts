import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardController } from './leaderboard.controller';
import { MeProgressController } from './me-progress.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  imports: [AuthModule],
  controllers: [LeaderboardController, MeProgressController],
  providers: [LeaderboardService],
  // selection (004) reutiliza getLeaderboard() para resolver quién entra
  // por ranking -- no reimplementa el RANK() OVER.
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
