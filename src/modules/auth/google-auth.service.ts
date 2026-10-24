import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type Redis from 'ioredis';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { AppException } from '../../common/exceptions/app.exception';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import type { EnvConfig } from '../../config/env.validation';
import { TokenPairService } from './token-pair.service';
import { ConfiguredAdminAccessService } from './configured-admin-access.service';

const NONCE_TTL_SECONDS = 300;

@Injectable()
export class GoogleAuthService {
  private readonly google = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenPairService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly configuredAdmins: ConfiguredAdminAccessService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async challenge(): Promise<{ nonce: string }> {
    this.clientId();
    const nonce = randomBytes(32).toString('base64url');
    await this.redis.set(this.nonceKey(nonce), '1', 'EX', NONCE_TTL_SECONDS);
    return { nonce };
  }

  async login(credential: string, nonce: string) {
    const claims = await this.verifyClaims(credential, nonce);
    const email = normalizeEmail(claims.email!);
    const domain = email.slice(email.lastIndexOf('@') + 1);
    const institutional = domain === 'ucb.edu.bo' && claims.hd === 'ucb.edu.bo';
    const configuredAdmin = this.configuredAdmins.isConfiguredAdmin(email);
    const googleAuthoritative = domain === 'gmail.com' || (claims.hd === domain && !!claims.hd);
    if (!institutional) {
      if (domain === 'ucb.edu.bo') {
        throw new AppException(403, 'EMAIL_OWNERSHIP_REQUIRED', 'Se requiere verificar la titularidad de este correo.');
      }
      if (!googleAuthoritative) {
        const proof = await this.prisma.externalEmailProof.findUnique({
          where: { subject_email: { subject: claims.sub!, email } },
        });
        if (!proof?.verifiedAt) {
          throw new AppException(403, 'EMAIL_OWNERSHIP_REQUIRED', 'Se requiere verificar la titularidad de este correo.');
        }
      }
      if (!configuredAdmin) {
        const authorization = await this.prisma.eventEmailAccess.findFirst({
          where: { emailNormalized: email, revokedAt: null },
          select: { eventId: true },
        });
        if (!authorization) {
          throw new AppException(403, 'EMAIL_NOT_AUTHORIZED', 'Este correo no tiene acceso autorizado.');
        }
      }
    }

    return this.linkAndIssue(claims, email, configuredAdmin);
  }

  async verifyClaims(credential: string, nonce: string): Promise<TokenPayload> {
    const clientId = this.clientId();
    let claims: TokenPayload | undefined;
    try {
      claims = (await this.google.verifyIdToken({ idToken: credential, audience: clientId })).getPayload();
    } catch {
      throw new AppException(401, 'INVALID_GOOGLE_CREDENTIAL', 'La credencial de Google no es válida.');
    }
    if (!claims?.sub || !claims.email || claims.email_verified !== true || claims.nonce !== nonce) {
      throw new AppException(401, 'INVALID_GOOGLE_CREDENTIAL', 'La credencial de Google no es válida.');
    }
    // GETDEL makes replay fail even when two requests race.
    if (!(await this.redis.getdel(this.nonceKey(nonce)))) {
      throw new AppException(401, 'INVALID_GOOGLE_CHALLENGE', 'El inicio de sesión venció o ya fue utilizado.');
    }

    return claims;
  }

  private async linkAndIssue(claims: TokenPayload, email: string, configuredAdmin: boolean) {
    const linked = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider: 'GOOGLE', subject: claims.sub } },
      include: { user: { include: { roles: true } } },
    });
    let user = linked?.user;
    if (user && user.email !== email) {
      throw new AppException(409, 'IDENTITY_CONFLICT', 'La identidad está vinculada a otro correo.');
    }
    if (!user) {
      const existing = await this.prisma.user.findUnique({ where: { email }, include: { roles: true } });
      if (existing?.status === 'DISABLED') {
        throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa.');
      }
      try {
        user = await this.prisma.$transaction(async (tx) => {
          const account = existing ?? await tx.user.create({
            data: {
              email,
              fullName: (claims!.name?.trim() || email).slice(0, 200),
              status: 'ACTIVE',
              registrationSource: 'GOOGLE',
              roles: { create: { role: 'ALUMNO' } },
            },
            include: { roles: true },
          });
          await tx.userIdentity.create({ data: { userId: account.id, provider: 'GOOGLE', subject: claims!.sub,
            verifiedEmail: email, hostedDomain: claims!.hd ?? null } });
          if (configuredAdmin && account.status === 'ACTIVE') {
            await this.configuredAdmins.grantBothEvents(tx, account.id, email);
          }
          return tx.user.findUniqueOrThrow({ where: { id: account.id }, include: { roles: true } });
        });
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
          // Never guess which identity won a concurrent link; a retry safely re-reads both unique keys.
          throw new AppException(409, 'IDENTITY_CONFLICT', 'No se pudo vincular la identidad. Intenta nuevamente.');
        }
        throw error;
      }
    }
    if (linked && configuredAdmin && user.status === 'ACTIVE') {
      user = await this.prisma.$transaction(async (tx) => {
        await this.configuredAdmins.grantBothEvents(tx, user!.id, email);
        return tx.user.findUniqueOrThrow({ where: { id: user!.id }, include: { roles: true } });
      });
    }
    if (linked && user.status !== 'DISABLED') {
      await this.prisma.userIdentity.update({
        where: { id: linked.id },
        data: { verifiedEmail: email, hostedDomain: claims.hd ?? null },
      });
    }
    if (user.status !== 'ACTIVE') {
      throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'Tu cuenta no está activa todavía.', { status: user.status });
    }
    const roles = user.roles.map((role) => role.role);
    const pair = await this.tokens.issue({ id: user.id, status: user.status, roles });
    return {
      ...pair,
      user: { id: user.id, email: user.email, fullName: user.fullName, nickname: user.nickname,
        nicknameRequired: !user.nickname, roles, status: user.status },
    };
  }

  private clientId(): string {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!clientId) throw new AppException(503, 'GOOGLE_AUTH_UNAVAILABLE', 'El acceso con Google no está configurado.');
    return clientId;
  }

  private nonceKey(nonce: string): string {
    return 'google-nonce:' + createHash('sha256').update(nonce).digest('hex');
  }
}
