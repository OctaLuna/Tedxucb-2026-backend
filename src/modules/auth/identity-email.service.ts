import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../common/crypto/token-hash.util';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { AppException } from '../../common/exceptions/app.exception';
import type { EnvConfig } from '../../config/env.validation';
import { GoogleAuthService } from './google-auth.service';
import { EventAccessService } from '../event-access/event-access.service';
import { SUPPORTED_EVENT_SLUGS, type SupportedEventSlug } from '../../common/events/supported-event-slugs';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class IdentityEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleAuthService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly eventAccess: EventAccessService,
  ) {}

  async requestVerification(credential: string, nonce: string, eventSlug: SupportedEventSlug) {
    const claims = await this.google.verifyClaims(credential, nonce);
    const email = normalizeEmail(claims.email!);
    if (email.endsWith('@ucb.edu.bo')) {
      throw new AppException(403, 'WORKSPACE_REQUIRED', 'El correo institucional requiere una cuenta Workspace UCB.');
    }
    await this.requireAllowed(email, eventSlug);
    const subject = claims.sub!;
    const current = await this.prisma.externalEmailProof.findUnique({ where: { subject_email: { subject, email } } });
    if (current?.verifiedAt) return { status: 'ALREADY_VERIFIED' };
    const token = generateOpaqueToken();
    const url = this.link('emailVerification', token, eventSlug);
    const expiresAt = new Date(Date.now() + THREE_DAYS_MS);
    await this.prisma.externalEmailProof.upsert({
      where: { subject_email: { subject, email } },
      create: { subject, email, tokenHash: hashToken(token), expiresAt },
      update: { tokenHash: hashToken(token), expiresAt, consumedAt: null },
    });
    return { status: await this.deliver('identity-email-verification', email, url), expiresAt };
  }

  async confirmVerification(token: string) {
    const proof = await this.prisma.externalEmailProof.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!proof || proof.consumedAt || proof.expiresAt <= new Date()) this.invalidLink();
    await this.requireAllowed(proof!.email);
    const now = new Date();
    const result = await this.prisma.externalEmailProof.updateMany({
      where: { id: proof!.id, tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, verifiedAt: now },
    });
    if (result.count !== 1) this.invalidLink();
    return { status: 'VERIFIED' };
  }

  async invite(actorId: string, emailInput: string, eventSlug: SupportedEventSlug) {
    await this.eventAccess.assertAdminEventAccess(actorId, eventSlug);
    const email = normalizeEmail(emailInput);
    const eventId = await this.requireAllowed(email, eventSlug);
    const token = generateOpaqueToken();
    const url = this.link('invitation', token, eventSlug);
    const expiresAt = new Date(Date.now() + THREE_DAYS_MS);
    await this.prisma.identityInvitation.create({ data: { email, eventId, tokenHash: hashToken(token), expiresAt } });
    return { status: await this.deliver('identity-invitation', email, url), expiresAt };
  }

  async consumeInvitation(token: string) {
    const invitation = await this.prisma.identityInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { event: { select: { slug: true } } },
    });
    const eventSlug = invitation?.event.slug;
    if (!invitation || invitation.consumedAt || invitation.expiresAt <= new Date() ||
      !SUPPORTED_EVENT_SLUGS.includes(eventSlug as SupportedEventSlug)) this.invalidLink();
    await this.requireAllowed(invitation!.email, eventSlug as SupportedEventSlug);
    const now = new Date();
    const result = await this.prisma.identityInvitation.updateMany({
      where: { id: invitation!.id, tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (result.count !== 1) this.invalidLink();
    return { status: 'VALID' };
  }

  private async requireAllowed(email: string, eventSlug?: SupportedEventSlug): Promise<string> {
    const event = eventSlug
      ? await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true } })
      : null;
    if (eventSlug && !event) throw new AppException(403, 'EMAIL_NOT_AUTHORIZED', 'Este correo no tiene acceso autorizado.');
    const access = await this.prisma.eventEmailAccess.findFirst({
      where: { emailNormalized: email, revokedAt: null, ...(event ? { eventId: event.id } : {}) },
      select: { eventId: true },
    });
    if (!access) throw new AppException(403, 'EMAIL_NOT_AUTHORIZED', 'Este correo no tiene acceso autorizado.');
    return access.eventId;
  }

  private link(fragmentName: string, token: string, eventSlug: SupportedEventSlug): string {
    const configured = eventSlug === 'tedxucb'
      ? this.config.get('PUBLIC_FRONTEND_URL_TEDX', { infer: true })
      : this.config.get('PUBLIC_FRONTEND_URL_INNOVATION_WEEK', { infer: true });
    if (!configured) throw new AppException(503, 'FRONTEND_URL_UNAVAILABLE', 'No está configurada la URL del sitio.');
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (this.config.get('NODE_ENV', { infer: true }) === 'production' && url.protocol !== 'https:')) {
      throw new AppException(503, 'FRONTEND_URL_UNAVAILABLE', 'La URL del sitio no es válida.');
    }
    url.hash = new URLSearchParams({ [fragmentName]: token }).toString();
    return url.toString();
  }

  private async deliver(kind: 'identity-invitation' | 'identity-email-verification', to: string, url: string) {
    try {
      await this.mail.send(kind, { to, url });
      return 'SENT';
    } catch {
      return 'DELIVERY_FAILED';
    }
  }

  private invalidLink(): never {
    throw new AppException(400, 'INVALID_EMAIL_LINK', 'El enlace no es válido o venció.');
  }
}
