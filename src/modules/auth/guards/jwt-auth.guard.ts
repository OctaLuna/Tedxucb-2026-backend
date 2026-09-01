import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../../../common/exceptions/app.exception';
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
  constructor(private readonly jwt: JwtService) {}

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
