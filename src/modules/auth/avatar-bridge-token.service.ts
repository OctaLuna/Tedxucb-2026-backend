import { createHmac, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/exceptions/app.exception';
import type { EnvConfig } from '../../config/env.validation';

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

@Injectable()
export class AvatarBridgeTokenService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  issue(userId: string, scope: 'avatar:claim' | 'avatar:revoke' = 'avatar:claim'): { token: string; expiresAt: string } {
    const secret = this.config.get('AVATAR_BRIDGE_SECRET', { infer: true });
    if (!secret) throw new AppException(503, 'AVATAR_BRIDGE_UNAVAILABLE', 'La vinculación de avatar no está configurada.');

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + 90) * 1000);
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'tedx-ucb-backend', aud: 'avatar-2d', sub: userId, scope, iat: now, exp: now + 90, jti: randomUUID() })}`;
    const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
    return { token: `${unsigned}.${signature}`, expiresAt: expiresAt.toISOString() };
  }
}
