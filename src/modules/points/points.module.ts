import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../../common/ledger/ledger.module';
import { PointsHistoryController } from './points-history.controller';
import { PointsAdjustmentsController } from './points-adjustments.controller';
import { PointsHistoryService } from './points-history.service';
import { PointsAdjustmentsService } from './points-adjustments.service';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationProcessor } from './reconciliation.processor';
import { POINTS_RECONCILIATION_QUEUE } from './points.constants';

@Module({
  imports: [
    AuthModule,
    LedgerModule,
    BullModule.registerQueue({
      name: POINTS_RECONCILIATION_QUEUE,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    }),
  ],
  controllers: [PointsHistoryController, PointsAdjustmentsController],
  providers: [PointsHistoryService, PointsAdjustmentsService, ReconciliationService, ReconciliationProcessor],
  exports: [ReconciliationService],
})
export class PointsModule {}
