import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { MailModule } from '../../common/mail/mail.module';
import { SelectionController } from './selection.controller';
import { EntriesController } from './entries.controller';
import { MeEntryController } from './me-entry.controller';
import { SelectionService } from './selection.service';
import { EntriesService } from './entries.service';

@Module({
  imports: [AuthModule, LeaderboardModule, MailModule],
  controllers: [SelectionController, EntriesController, MeEntryController],
  providers: [SelectionService, EntriesService],
})
export class SelectionModule {}
