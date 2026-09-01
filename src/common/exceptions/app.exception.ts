import { HttpException } from '@nestjs/common';

/**
 * Excepción uniforme del proyecto: statusCode + código propio en
 * SCREAMING_SNAKE_CASE + mensaje en español + detalles opcionales
 * (skill contratos-api). `error` es parte del contrato — cambiarlo rompe
 * clientes, trátalo como una API pública.
 */
export class AppException extends HttpException {
  constructor(
    statusCode: number,
    public readonly error: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode, error, message, details }, statusCode);
  }
}
