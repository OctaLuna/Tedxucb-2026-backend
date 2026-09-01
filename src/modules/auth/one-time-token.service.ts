import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../common/crypto/token-hash.util';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthTokenType, ONE_TIME_TOKEN_TTL_DAYS } from './auth.constants';

export interface IssueOneTimeTokenParams {
  userId: string;
  type: AuthTokenType;
  createdById?: string;
  newEmail?: string;
}

/**
 * T033. Genérico: invitación, verificación de correo y recuperación de
 * contraseña son, por RF-108, la misma regla (un solo uso, 7 días) aplicada
 * a tres disparadores distintos. `users` (001-c) reutiliza este servicio
 * tal cual para invitaciones y verificación de correo — no lo dupliques.
 */
@Injectable()
export class OneTimeTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invalida cualquier token pendiente del mismo (userId, type) —lo exige
   * el índice único parcial `one_pending_token_per_user_type`— y emite uno
   * nuevo.
   */
  async issue(params: IssueOneTimeTokenParams): Promise<{ token: string }> {
    const token = generateOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + ONE_TIME_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId: params.userId, type: params.type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId: params.userId,
          type: params.type,
          tokenHash,
          expiresAt,
          createdById: params.createdById,
          newEmail: params.newEmail ? normalizeEmail(params.newEmail) : undefined,
        },
      }),
    ]);

    return { token };
  }

  /**
   * Valida el token y lo devuelve — NO decide el efecto de negocio ni lo
   * marca consumido: cada llamador (verify-email, accept-invitation,
   * password-reset/confirm) tiene su propia decisión transaccional sobre
   * qué hacer con un token ya consumido (p. ej. idempotencia).
   */
  async find(tokenPlain: string, type: AuthTokenType) {
    const tokenHash = hashToken(tokenPlain);
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash } });

    if (!record || record.type !== type) {
      throw new AppException(400, 'INVALID_TOKEN', 'El enlace no es válido.');
    }

    if (!record.consumedAt && record.expiresAt < new Date()) {
      throw new AppException(410, 'EXPIRED_TOKEN', 'El enlace venció.', {
        expiredAt: record.expiresAt,
      });
    }

    return record;
  }

  /** Protegido implícitamente por el trigger no_reconsume_auth_token. */
  async markConsumed(id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    await tx.authToken.update({ where: { id }, data: { consumedAt: new Date() } });
  }
}
