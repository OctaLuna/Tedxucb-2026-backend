import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { EnvConfig } from '../../config/env.validation';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Extiende ioredis directamente (mismo patrón que PrismaService con
 * PrismaClient): sin cerrar la conexión al destruir el módulo, el proceso
 * de Node queda vivo indefinidamente después de que las pruebas terminan
 * (comprobado: sin este cierre, `app.close()` no basta para que Jest salga).
 */
@Injectable()
class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService<EnvConfig, true>) {
    super(config.get('REDIS_URL', { infer: true }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}

@Global()
@Module({
  providers: [RedisService, { provide: REDIS_CLIENT, useExisting: RedisService }],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
