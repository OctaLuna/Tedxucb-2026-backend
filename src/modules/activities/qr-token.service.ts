import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import type { EnvConfig } from '../../config/env.validation';

const QR_TOKEN_TTL_SECONDS = 60; // RF-312, vigencia confirmada 2026-09-02

interface QrTokenPayload {
  sid: string;
  iat: number;
  exp: number;
}

/**
 * HMAC-SHA256 crudo con node:crypto, no JwtService/JwtModule: introducir un
 * segundo secreto ahí exigiría una segunda instancia con provider propio,
 * complejidad sin razón demostrable (Artículo VIII). Payload trivial, sin
 * negociación de algoritmo. Puro -- Artículo I, prueba unitaria sin BD.
 */
@Injectable()
export class QrTokenService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  issue(studentId: string): { token: string; expiresAt: Date; issuedAt: Date } {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + QR_TOKEN_TTL_SECONDS * 1000);
    const payload: QrTokenPayload = {
      sid: studentId,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(encodedPayload);
    return { token: `${encodedPayload}.${signature}`, expiresAt, issuedAt };
  }

  /**
   * Nunca devuelve un studentId sin haber verificado la firma primero.
   * 400 INVALID_QR_TOKEN (firma inválida/malformado) o 401
   * EXPIRED_QR_TOKEN (vencido, RF-312/RF-313).
   */
  verify(token: string | undefined): { studentId: string } {
    const [encodedPayload, signature] = (token ?? '').split('.');
    if (!encodedPayload || !signature) {
      throw new AppException(400, 'INVALID_QR_TOKEN', 'El código no es válido.');
    }

    const expectedSignature = this.sign(encodedPayload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    // timingSafeEqual exige buffers de igual longitud -- comparar antes
    // evita filtrar tiempo de respuesta como oráculo.
    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
      throw new AppException(400, 'INVALID_QR_TOKEN', 'El código no es válido.');
    }

    let payload: QrTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new AppException(400, 'INVALID_QR_TOKEN', 'El código no es válido.');
    }

    if (Date.now() / 1000 > payload.exp) {
      throw new AppException(401, 'EXPIRED_QR_TOKEN', 'El código venció, pide uno nuevo.', {
        expiredAt: new Date(payload.exp * 1000).toISOString(),
      });
    }

    return { studentId: payload.sid };
  }

  private sign(encodedPayload: string): string {
    const secret = this.config.get('QR_TOKEN_SECRET', { infer: true });
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }
}
