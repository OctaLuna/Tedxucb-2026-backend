import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { MAIL_QUEUE } from './mail.constants';

/**
 * La conexión de BullMQ (`forRootAsync`, con `maxRetriesPerRequest: null`
 * que exige BullMQ y que el ioredis ya expuesto en common/redis no
 * configura) vive en `app.module.ts` desde que `points` (003-b) también
 * necesitó una cola propia -- promovida tal como anticipaba este comentario
 * cuando solo `mail` la usaba. Este módulo solo registra su propia cola
 * sobre esa conexión compartida.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: MAIL_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
