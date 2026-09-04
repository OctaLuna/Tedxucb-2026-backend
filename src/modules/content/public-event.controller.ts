import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  async getPublicEvent() {
    return this.eventsService.getPublicSnapshot();
  }
}
