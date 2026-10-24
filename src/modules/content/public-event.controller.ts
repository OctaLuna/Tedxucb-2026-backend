import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

/** /api/v1/public/* -- sin autenticación, necesita límite propio (skill seguridad-y-roles). */
@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicEventController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('event')
  @RateLimit({ keyPrefix: 'public-event', limit: 60, windowSeconds: 60 })
  // serverTime pierde su propósito si la respuesta se cachea (RF-204, ver
  // contracts/evento-y-cuenta-regresiva.md).
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'slug', required: false, example: 'innovation-week' })
  async getPublicEvent(@Query('slug') slug = 'tedxucb') {
    return this.eventsService.getPublicSnapshot(slug);
  }
}
