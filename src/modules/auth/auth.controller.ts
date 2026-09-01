import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
