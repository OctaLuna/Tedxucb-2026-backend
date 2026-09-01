import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { AppException } from '../exceptions/app.exception';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

/**
 * Cuenta peticiones por IP en una ventana deslizante fija, respaldado por
 * Redis (INCR + EXPIRE). Reemplaza a @nestjs/throttler: su última versión
 * publicada no declara soporte para @nestjs/common@^12 (verificado contra
 * el registro de npm), y esta implementación cubre exactamente lo que T038
 * necesita sin arrastrar una dependencia de compatibilidad incierta
 * (Artículo VIII).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? 'unknown';
    const key = `rate-limit:${options.keyPrefix}:${ip}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSeconds);
    }

    if (count > options.limit) {
      throw new AppException(
        429,
        'TOO_MANY_REQUESTS',
        'Demasiadas peticiones. Intenta de nuevo más tarde.',
      );
    }

    return true;
  }
}
