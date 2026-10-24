import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { SpeakersService } from './speakers.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

/** /api/v1/public/* -- sin autenticación, necesita límite propio (skill seguridad-y-roles). */
@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicSpeakersController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get('speakers')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @RateLimit({ keyPrefix: 'public-speakers', limit: 60, windowSeconds: 60 })
  async list(@Query('eventSlug') eventSlug = 'tedxucb') {
    return this.speakersService.listPublic(eventSlug);
  }
}
