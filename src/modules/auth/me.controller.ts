import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './token-pair.service';

/**
 * Controlador propio (no auth.controller): /me nunca acepta un id
 * parametrizado, siempre "quien está autenticado ahora" (skill
 * seguridad-y-roles).
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.me(user.sub);
  }
}
