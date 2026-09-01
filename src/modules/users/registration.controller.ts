import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/** Mismo prefijo /auth que auth.controller.ts (módulo distinto, sin colisión de rutas). */
@Controller('auth')
@UseGuards(RateLimitGuard)
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('register')
  @RateLimit({ keyPrefix: 'register', limit: 5, windowSeconds: 3600 })
  async register(@Body() dto: RegisterDto) {
    return this.registrationService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.registrationService.verifyEmail(dto.token);
  }
}
