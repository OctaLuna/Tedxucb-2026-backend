import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './token-pair.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleAuthService } from './google-auth.service';
import { AllowIncompleteProfile } from './decorators/allow-incomplete-profile.decorator';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly googleAuth: GoogleAuthService) {}

  @Post('google/challenge')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ keyPrefix: 'google-challenge', limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: 'Crear un nonce de un solo uso para Google', description: 'Válido por cinco minutos. Debe incluirse al inicializar Google Identity Services.' })
  @ApiResponse({ status: 200, description: 'Nonce generado.', schema: { example: { nonce: 'nonce-aleatorio-de-un-solo-uso' } } })
  @ApiResponse({ status: 503, description: 'GOOGLE_AUTH_UNAVAILABLE: falta configurar GOOGLE_CLIENT_ID.' })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS: límite temporal de peticiones.' })
  async googleChallenge() {
    return this.googleAuth.challenge();
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ keyPrefix: 'google-login', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Iniciar sesión o vincular la cuenta con Google', description: 'Valida el ID token y consume el nonce. El correo institucional requiere Workspace UCB; los externos necesitan autorización y prueba suficiente de titularidad.' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiResponse({ status: 200, description: 'Sesión emitida.', schema: { example: {
    accessToken: 'jwt', refreshToken: 'token-opaco', expiresIn: 900,
    user: { id: '00000000-0000-4000-8000-000000000000', email: 'persona@ucb.edu.bo',
      fullName: 'Persona', nickname: null, nicknameRequired: true, roles: ['ALUMNO'], status: 'ACTIVE' },
  } } })
  @ApiResponse({ status: 401, description: 'INVALID_GOOGLE_CREDENTIAL o INVALID_GOOGLE_CHALLENGE.' })
  @ApiResponse({ status: 403, description: 'EMAIL_OWNERSHIP_REQUIRED, EMAIL_NOT_AUTHORIZED o ACCOUNT_NOT_ACTIVE.' })
  @ApiResponse({ status: 409, description: 'IDENTITY_CONFLICT: no se pudo vincular la identidad.' })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS: límite temporal de peticiones.' })
  @ApiResponse({ status: 503, description: 'GOOGLE_AUTH_UNAVAILABLE: falta configurar GOOGLE_CLIENT_ID.' })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.googleAuth.login(dto.credential, dto.nonce);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ keyPrefix: 'login', limit: 10, windowSeconds: 60 })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @AllowIncompleteProfile()
  async logoutAll(@CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.authService.logoutAll(user.sub);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto.token, dto.password);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ keyPrefix: 'password-reset', limit: 5, windowSeconds: 3600 })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'Si el correo existe, se envió un enlace de recuperación.' };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    await this.authService.confirmPasswordReset(dto.token, dto.newPassword);
    return { message: 'Contraseña actualizada.' };
  }
}
