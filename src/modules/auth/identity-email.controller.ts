import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AccessTokenPayload } from './token-pair.service';
import { GoogleEmailVerificationDto } from './dto/google-email-verification.dto';
import { IdentityEmailTokenDto, IdentityInvitationDto } from './dto/identity-email.dto';
import { IdentityEmailService } from './identity-email.service';

@ApiTags('auth')
@Controller()
@UseGuards(RateLimitGuard)
export class IdentityEmailController {
  constructor(private readonly identityEmail: IdentityEmailService) {}

  @Post('auth/google/email-verification/request')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ keyPrefix: 'identity-email-request', limit: 5, windowSeconds: 3600 })
  @ApiOperation({ summary: 'Solicitar prueba de titularidad para correo externo autorizado', description: 'Consume nonce y credencial Google; no emite sesión. El enlace vence en tres días.' })
  @ApiResponse({ status: 200, description: 'SENT, DELIVERY_FAILED o ALREADY_VERIFIED.' })
  @ApiResponse({ status: 403, description: 'EMAIL_NOT_AUTHORIZED o WORKSPACE_REQUIRED.' })
  @ApiResponse({ status: 503, description: 'Configuración de Google o URL pública ausente.' })
  request(@Body() dto: GoogleEmailVerificationDto) {
    return this.identityEmail.requestVerification(dto.credential, dto.nonce, dto.eventSlug);
  }

  @Post('auth/google/email-verification/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ keyPrefix: 'identity-email-confirm', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Confirmar el enlace de un solo uso sin emitir sesión' })
  @ApiResponse({ status: 200, description: 'VERIFIED. Iniciar sesión nuevamente con Google.' })
  @ApiResponse({ status: 400, description: 'INVALID_EMAIL_LINK.' })
  @ApiResponse({ status: 403, description: 'EMAIL_NOT_AUTHORIZED.' })
  confirm(@Body() dto: IdentityEmailTokenDto) {
    return this.identityEmail.confirmVerification(dto.token);
  }

  @Post('admin/identity-invitations')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'identity-invitation', limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: 'Enviar invitación a correo ya autorizado', description: 'ADMIN activo con acceso al evento solicitado; la invitación no crea ni modifica la autorización.' })
  @ApiResponse({ status: 200, description: 'SENT o DELIVERY_FAILED y fecha de vencimiento.' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN o EMAIL_NOT_AUTHORIZED.' })
  @ApiResponse({ status: 503, description: 'URL pública del frontend ausente.' })
  invite(@CurrentUser() user: AccessTokenPayload, @Body() dto: IdentityInvitationDto) {
    return this.identityEmail.invite(user.sub, dto.email, dto.eventSlug);
  }

  @Post('auth/identity-invitations/consume')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ keyPrefix: 'identity-invitation-consume', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Consumir una invitación vigente sin emitir sesión ni permisos' })
  @ApiResponse({ status: 200, description: 'VALID. Continuar con Google.' })
  @ApiResponse({ status: 400, description: 'INVALID_EMAIL_LINK.' })
  @ApiResponse({ status: 403, description: 'EMAIL_NOT_AUTHORIZED.' })
  consume(@Body() dto: IdentityEmailTokenDto) {
    return this.identityEmail.consumeInvitation(dto.token);
  }
}
