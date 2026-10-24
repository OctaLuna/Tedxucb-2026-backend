import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../../common/ledger/ledger.module';
import { PointsHistoryController } from './points-history.controller';
import { PointsAdjustmentsController } from './points-adjustments.controller';
import { ReconciliationCronController } from './reconciliation.controller';
import { PointsHistoryService } from './points-history.service';
import { PointsAdjustmentsService } from './points-adjustments.service';
import { ReconciliationService } from './reconciliation.service';
import { EventAccessModule } from '../event-access/event-access.module';

@Module({
  imports: [AuthModule, LedgerModule, EventAccessModule],
  controllers: [PointsHistoryController, PointsAdjustmentsController, ReconciliationCronController],
  providers: [PointsHistoryService, PointsAdjustmentsService, ReconciliationService],
  exports: [ReconciliationService],
})
export class PointsModule {}
