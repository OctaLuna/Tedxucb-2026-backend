import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Receiver } from '@upstash/qstash';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.validation';

/**
 * Protege los endpoints internos que QStash llama de vuelta
 * (`/internal/mail/send`, `/internal/cron/reconciliation`) -- reemplaza al
 * worker persistente de BullMQ, que no existe en un entorno serverless.
 * Verifica la firma `Upstash-Signature` contra el cuerpo CRUDO de la
 * petición (`request.rawBody`, habilitado en el bootstrap con
 * `rawBody: true`): verificar contra `JSON.stringify(request.body)` ya
 * parseado puede no coincidir byte a byte con lo que QStash firmó.
 *
 * Sin QSTASH_CURRENT_SIGNING_KEY/QSTASH_NEXT_SIGNING_KEY configuradas
 * (desarrollo/pruebas, sin QStash) estos endpoints nunca deberían
 * recibir tráfico -- MailService envía directo en ese caso. Si igual
 * llega algo, se rechaza.
 */
@Injectable()
export class QstashSignatureGuard implements CanActivate {
  private readonly receiver?: Receiver;

  constructor(config: ConfigService<EnvConfig, true>) {
    const currentSigningKey = config.get('QSTASH_CURRENT_SIGNING_KEY', { infer: true });
    const nextSigningKey = config.get('QSTASH_NEXT_SIGNING_KEY', { infer: true });
    if (currentSigningKey && nextSigningKey) {
      this.receiver = new Receiver({ currentSigningKey, nextSigningKey });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.receiver) {
      throw new UnauthorizedException('QStash no está configurado en este entorno.');
    }

    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = request.headers['upstash-signature'];
    if (typeof signature !== 'string' || !request.rawBody) {
      throw new UnauthorizedException('Falta la firma de QStash.');
    }

    const isValid = await this.receiver.verify({ signature, body: request.rawBody.toString('utf8') });
    if (!isValid) {
      throw new UnauthorizedException('Firma de QStash inválida.');
    }
    return true;
  }
}
