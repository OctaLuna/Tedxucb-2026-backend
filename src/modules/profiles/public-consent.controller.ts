import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConsentVersionsService } from './consent-versions.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

/** /api/v1/public/* -- sin autenticación, necesita límite propio (skill seguridad-y-roles). */
@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicConsentController {
  constructor(private readonly consentVersionsService: ConsentVersionsService) {}

  @Get('consent-version')
  @RateLimit({ keyPrefix: 'public-consent-version', limit: 30, windowSeconds: 60 })
  async getActive() {
    return this.consentVersionsService.getActive();
  }
}
