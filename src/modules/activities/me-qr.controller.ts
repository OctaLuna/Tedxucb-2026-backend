import { Controller, Get, UseGuards } from '@nestjs/common';
import { QrTokenService } from './qr-token.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeQrController {
  constructor(private readonly qrTokenService: QrTokenService) {}

  @Get('qr')
  @Roles('ALUMNO')
  getQr(@CurrentUser() user: AccessTokenPayload) {
    const { token, expiresAt } = this.qrTokenService.issue(user.sub);
    return { token, expiresAt: expiresAt.toISOString(), refreshInSeconds: 45 };
  }
}
