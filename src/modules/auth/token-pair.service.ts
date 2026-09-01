import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../common/crypto/token-hash.util';
import { AppException } from '../../common/exceptions/app.exception';
import type { EnvConfig } from '../../config/env.validation';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  status: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface IssuableUser {
  id: string;
  status: string;
  roles: string[];
}

@Injectable()
export class TokenPairService {
  private readonly logger = new Logger(TokenPairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** T031 — nuevo login: nueva familia de refresh (nueva sesión/dispositivo). */
  async issue(user: IssuableUser): Promise<TokenPair> {
    const familyId = randomUUID();
    return this.issueWithinFamily(user, familyId);
  }

  /**
   * T031 + T032 — rota el refresh presentado. Si ya fue rotado antes
   * (reuso: alguien más tiene una copia), revoca toda la familia y lo
   * registra en auditoría.
   */
  async rotate(presentedRefreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(presentedRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppException(401, 'INVALID_REFRESH_TOKEN', 'La sesión no es válida o venció.');
    }

    if (stored.replacedById) {
      await this.revokeFamily(stored.familyId, stored.userId);
      throw new AppException(401, 'INVALID_REFRESH_TOKEN', 'La sesión no es válida o venció.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { roles: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new AppException(401, 'INVALID_REFRESH_TOKEN', 'La sesión no es válida o venció.');
    }

    return this.prisma.$transaction(async (tx) => {
      const nextToken = generateOpaqueToken();
      const nextHash = hashToken(nextToken);
      const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: nextHash,
          familyId: stored.familyId,
          expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { replacedById: created.id },
      });

      return {
        accessToken: await this.signAccessToken({
          id: user.id,
          status: user.status,
          roles: user.roles.map((r) => r.role),
        }),
        refreshToken: nextToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      };
    });
  }

  /** Logout: revoca únicamente la sesión presentada. */
  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Logout-all, y el logout-all implícito al confirmar un password-reset. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
          entityType: 'user',
          entityId: userId,
          detail: { familyId },
        },
      }),
    ]);
    this.logger.warn(`Reuso de refresh token detectado, familia revocada: ${familyId}`);
  }

  private async issueWithinFamily(user: IssuableUser, familyId: string): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    const tokenHash = hashToken(refreshToken);
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, familyId, expiresAt },
    });

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async signAccessToken(user: IssuableUser): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, roles: user.roles, status: user.status };
    return this.jwt.signAsync(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }
}
