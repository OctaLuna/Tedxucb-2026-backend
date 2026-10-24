import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { AppException } from '../../common/exceptions/app.exception';
import { PasswordHashingService } from './password-hashing.service';
import { TokenPairService, TokenPair } from './token-pair.service';
import { OneTimeTokenService } from './one-time-token.service';
import { AuthTokenType, UserStatus } from './auth.constants';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';

export interface LoginResult extends TokenPair {
  user: { id: string; fullName: string; roles: string[]; status: string };
}

export interface MeResult {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  status: string;
  nickname: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashing: PasswordHashingService,
    private readonly tokenPair: TokenPairService,
    private readonly oneTimeToken: OneTimeTokenService,
  ) {}

  async login(emailInput: string, password: string): Promise<LoginResult> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email }, include: { roles: true } });

    // Mismo mensaje exista o no la cuenta, o sea cual sea el campo que
    // falló: anti-enumeración (contrato autenticacion-y-sesiones.md).
    if (!user || !user.passwordHash) {
      throw new AppException(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }

    const validPassword = await this.passwordHashing.verify(user.passwordHash, password);
    if (!validPassword) {
      throw new AppException(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa todavía.', {
        status: user.status,
      });
    }

    const roles = user.roles.map((r) => r.role);
    const pair = await this.tokenPair.issue({ id: user.id, status: user.status, roles });

    return { ...pair, user: { id: user.id, fullName: user.fullName, roles, status: user.status } };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokenPair.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenPair.revoke(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenPair.revokeAllForUser(userId);
  }

  async acceptInvitation(tokenPlain: string, password: string): Promise<{ userId: string; status: string }> {
    const record = await this.oneTimeToken.find(tokenPlain, AuthTokenType.INVITATION);
    if (record.consumedAt) {
      throw new AppException(400, 'INVALID_TOKEN', 'El enlace no es válido.');
    }

    const passwordHash = await this.passwordHashing.hash(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: record.userId },
        data: { status: UserStatus.ACTIVE, passwordHash },
      });
      await this.oneTimeToken.markConsumed(record.id, tx);
      await tx.auditLog.create({
        data: {
          actorId: updated.id,
          action: 'INVITATION_ACCEPTED',
          entityType: 'user',
          entityId: updated.id,
        },
      });
      return updated;
    });

    return { userId: user.id, status: user.status };
  }

  /** Siempre responde igual, exista o no la cuenta (anti-enumeración). */
  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && user.status === UserStatus.ACTIVE) {
      await this.oneTimeToken.issue({ userId: user.id, type: AuthTokenType.PASSWORD_RESET });
      // El envío real del correo lo encola el módulo de notificaciones —
      // fuera del alcance de auth (T033 solo emite el token).
    }
  }

  async confirmPasswordReset(tokenPlain: string, newPassword: string): Promise<void> {
    const record = await this.oneTimeToken.find(tokenPlain, AuthTokenType.PASSWORD_RESET);
    if (record.consumedAt) {
      throw new AppException(400, 'INVALID_TOKEN', 'El enlace no es válido.');
    }

    const passwordHash = await this.passwordHashing.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await this.oneTimeToken.markConsumed(record.id, tx);
      await tx.auditLog.create({
        data: {
          actorId: record.userId,
          action: 'PASSWORD_RESET_CONFIRMED',
          entityType: 'user',
          entityId: record.userId,
        },
      });
    });

    // Logout-all implícito: si alguien pidió la recuperación porque su
    // contraseña estaba comprometida, las sesiones abiertas con la vieja
    // no deben sobrevivir.
    await this.tokenPair.revokeAllForUser(record.userId);
  }

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });

    if (!user) {
      throw new AppException(404, 'NOT_FOUND', 'Usuario no encontrado.');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role),
      status: user.status,
      nickname: user.nickname,
    };
  }

  async updateNickname(userId: string, input: unknown): Promise<{ nickname: string }> {
    if (typeof input !== 'string') {
      throw new AppException(400, 'INVALID_NICKNAME', 'El apodo debe contener al menos tres letras o números.');
    }
    const nickname = input.normalize('NFKC');
    if ([...nickname].length < 3 || [...nickname].length > 24 || !/^[\p{L}\p{N}]+$/u.test(nickname)) {
      throw new AppException(400, 'INVALID_NICKNAME', 'El apodo debe tener entre 3 y 24 letras o números.');
    }

    try {
      const result = await this.prisma.user.updateMany({
        where: { id: userId, status: UserStatus.ACTIVE },
        data: { nickname, nicknameKey: nickname.toLowerCase().normalize('NFKC') },
      });
      if (result.count === 0) {
        throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa.');
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'users_nickname_key_key')) {
        throw new AppException(409, 'NICKNAME_TAKEN', 'Este apodo ya está en uso.');
      }
      throw error;
    }
    return { nickname };
  }
}
