import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { MAIL_QUEUE } from './mail.constants';
import type { EnvConfig } from '../../config/env.validation';

/**
 * Conexión de BullMQ propia, no reusa REDIS_CLIENT de common/redis: BullMQ
 * exige `maxRetriesPerRequest: null` en su conexión, y el cliente ioredis
 * ya expuesto (redis.module.ts) no lo configura. Autocontenido acá porque
 * hoy solo este módulo necesita colas (Artículo VII) -- si otro módulo
 * necesita una cola en el futuro, se promueve a app.module.ts entonces.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
      }),
    }),
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
