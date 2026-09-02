import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { AppException } from '../exceptions/app.exception';

interface UniformErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Traduce cualquier excepción al formato uniforme de la API
 * (skill contratos-api): { statusCode, error, message, details }.
 *
 * - AppException ya trae ese formato por construcción: se reenvía tal cual.
 *   Se comprueba con `instanceof AppException`, NUNCA por la forma del
 *   payload — el 400 por defecto de ValidationPipe también tiene
 *   {statusCode, error, message} (con error: "Bad Request"), así que
 *   confiar en la forma en vez del tipo reenviaría ese payload sin
 *   reformatear (bug real detectado en pruebas de contrato).
 * - El ValidationPipe de Nest lanza BadRequestException con un array de
 *   mensajes de class-validator, que no calza con el contrato — se
 *   reformatea siempre a VALIDATION_ERROR.
 * - `PayloadTooLargeException` (subida de archivos, p. ej. avatar): Nest
 *   YA traduce el `MulterError` de `LIMIT_FILE_SIZE` a esta excepción
 *   propia dentro de `FileInterceptor` (`transformException` en
 *   `@nestjs/platform-express`) antes de que llegue a este filtro -- un
 *   `instanceof MulterError` aquí nunca matchea, es la clase equivocada
 *   (bug real detectado en pruebas de contrato: caía en el `HTTP_ERROR`
 *   genérico de abajo en vez de `FILE_TOO_LARGE`).
 * - Cualquier otra excepción no controlada se oculta detrás de un 500
 *   genérico: nunca se filtra un stack trace ni un mensaje interno al
 *   cliente (Artículo V, datos personales y superficie de error).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const body = this.toUniformBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toUniformBody(exception: unknown): UniformErrorBody {
    if (exception instanceof AppException) {
      return exception.getResponse() as UniformErrorBody;
    }

    if (exception instanceof PayloadTooLargeException) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'FILE_TOO_LARGE',
        message: 'El archivo excede el tamaño máximo permitido.',
      };
    }

    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse();
      const rawMessage = (payload as { message?: string | string[] })?.message;
      const messages = Array.isArray(rawMessage) ? rawMessage : [rawMessage ?? exception.message];

      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'VALIDATION_ERROR',
        message: 'La petición no cumple el formato esperado.',
        details: { fields: messages },
      };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      return {
        statusCode: exception.getStatus(),
        error: 'HTTP_ERROR',
        message: typeof payload === 'string' ? payload : exception.message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
    };
  }
}
