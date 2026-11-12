import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './token-pair.service';
import { UpdateNicknameDto } from './dto/update-nickname.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { AvatarBridgeTokenService } from './avatar-bridge-token.service';
import { AppException } from '../../common/exceptions/app.exception';
import { AllowIncompleteProfile } from './decorators/allow-incomplete-profile.decorator';
import { PendingProgramAttendanceService } from './pending-program-attendance.service';

/**
 * Controlador propio (no auth.controller): /me nunca acepta un id
 * parametrizado, siempre "quien está autenticado ahora" (skill
 * seguridad-y-roles).
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly authService: AuthService,
    private readonly avatarBridge: AvatarBridgeTokenService,
    private readonly pendingAttendance: PendingProgramAttendanceService,
  ) {}

  @Get()
  @AllowIncompleteProfile()
  async me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.me(user.sub);
  }

  @Patch('nickname')
  @AllowIncompleteProfile()
  async updateNickname(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateNicknameDto) {
    return this.authService.updateNickname(user.sub, dto.nickname);
  }

  @Patch('registration')
  @AllowIncompleteProfile()
  async updateRegistration(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateRegistrationDto) {
    const registration = await this.authService.updateRegistration(user.sub, dto.nickname, dto.phone);
    await this.pendingAttendance.claimForUser(user.sub);
    return registration;
  }

  @Get('program-attendance/notifications')
  @AllowIncompleteProfile()
  async programAttendanceNotifications(@CurrentUser() user: AccessTokenPayload) {
    return this.pendingAttendance.listUnacknowledged(user.sub);
  }

  @Post('program-attendance/notifications/:id/acknowledge')
  @AllowIncompleteProfile()
  async acknowledgeProgramAttendanceNotification(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe()) notificationId: string,
  ) {
    return this.pendingAttendance.acknowledge(user.sub, notificationId);
  }

  @Get('avatar-session')
  @ApiOperation({ summary: 'Emitir token breve para abrir o vincular Avatar 2D' })
  @ApiResponse({ status: 200, description: 'Token HS256 de 90 segundos con audiencia avatar-2d y alcance avatar:claim.' })
  async avatarSession(@CurrentUser() user: AccessTokenPayload) {
    await this.assertActive(user.sub);
    return this.avatarBridge.issue(user.sub);
  }

  @Post('avatar-session/revocation-token')
  @ApiOperation({ summary: 'Emitir token breve para revocar sesiones del editor Avatar 2D' })
  @ApiResponse({ status: 200, description: 'Token HS256 de 90 segundos con alcance avatar:revoke.' })
  async avatarRevocationToken(@CurrentUser() user: AccessTokenPayload) {
    await this.assertActive(user.sub);
    return this.avatarBridge.issue(user.sub, 'avatar:revoke');
  }

  private async assertActive(userId: string) {
    const account = await this.authService.me(userId);
    if (account.status !== 'ACTIVE') throw new AppException(403, 'ACCOUNT_NOT_ACTIVE', 'La cuenta no puede vincular un avatar mientras esté inactiva.');
  }
}
