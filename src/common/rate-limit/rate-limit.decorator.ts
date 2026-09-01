import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Nombre corto y estable — parte de la clave de Redis. */
  keyPrefix: string;
  /** Peticiones permitidas dentro de la ventana. */
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Límite de frecuencia diferenciado por endpoint (skill seguridad-y-roles:
 * el endpoint público de registro recibe altas masivas, el de login recibe
 * fuerza bruta, el de recuperación recibe spam — son amenazas distintas,
 * un límite único no sirve para las tres).
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
