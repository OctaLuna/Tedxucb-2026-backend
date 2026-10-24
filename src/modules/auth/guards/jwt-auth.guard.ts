import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ALLOW_INCOMPLETE_PROFILE } from '../decorators/allow-incomplete-profile.decorator';
import { ALLOW_PENDING_ACCOUNT } from '../decorators/allow-pending-account.decorator';
import type { AccessTokenPayload } from '../token-pair.service';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

/**
 * Sin Passport: un solo mecanismo (Bearer JWT) sobre un solo endpoint de
 * login propio no justifica la capa de estrategias/serialización de
 * Passport (Artículo VIII).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new AppException(401, 'UNAUTHENTICATED', 'Falta el token de acceso.');
    }

    try {
      request.user = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new AppException(401, 'UNAUTHENTICATED', 'El token de acceso no es válido o venció.');
    }

    const allowIncompleteProfile = this.reflector.getAllAndOverride<boolean>(ALLOW_INCOMPLETE_PROFILE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowPendingAccount = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_ACCOUNT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const account = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { nickname: true, status: true },
    });
    if (!account) throw new AppException(401, 'UNAUTHENTICATED', 'La cuenta ya no existe.');
    if (account.status !== 'ACTIVE' && !(account.status === 'PENDING' && allowPendingAccount)) {
      throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa.', { status: account.status });
    }
    if (!allowIncompleteProfile && !account.nickname) {
      throw new AppException(403, 'NICKNAME_REQUIRED', 'Completa tu apodo para continuar.', {
        requiredAction: 'SET_NICKNAME',
        endpoint: '/api/v1/me/nickname',
      });
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice('Bearer '.length);
  }
}
