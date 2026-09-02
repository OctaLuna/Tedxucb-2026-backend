import { Controller, Get, UseGuards } from '@nestjs/common';
import { SpeakersService } from './speakers.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

/** /api/v1/public/* -- sin autenticación, necesita límite propio (skill seguridad-y-roles). */
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicSpeakersController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get('speakers')
  @RateLimit({ keyPrefix: 'public-speakers', limit: 60, windowSeconds: 60 })
  async list() {
    return this.speakersService.listPublic();
  }
}
