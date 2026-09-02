import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../../common/ledger/ledger.module';
import { MailModule } from '../../common/mail/mail.module';
import { ActivitiesController } from './activities.controller';
import { ActivityCategoriesController } from './activity-categories.controller';
import { MeQrController } from './me-qr.controller';
import { CheckinController } from './checkin.controller';
import { ActivitiesService } from './activities.service';
import { ActivityCategoriesService } from './activity-categories.service';
import { QrTokenService } from './qr-token.service';
import { CheckinService } from './checkin.service';
import { ActivityStaffGuard } from './guards/activity-staff.guard';

@Module({
  imports: [AuthModule, LedgerModule, MailModule],
  controllers: [ActivitiesController, ActivityCategoriesController, MeQrController, CheckinController],
  providers: [ActivitiesService, ActivityCategoriesService, QrTokenService, CheckinService, ActivityStaffGuard],
  exports: [ActivityStaffGuard],
})
export class ActivitiesModule {}
