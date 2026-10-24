import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { ActivitiesService } from './activities.service';

@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get('activities')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @RateLimit({ keyPrefix: 'public-activities', limit: 120, windowSeconds: 60 })
  list(
    @Query('eventSlug') eventSlug = 'tedxucb',
    @Query('page') pageValue?: string,
    @Query('limit') limitValue?: string,
  ) {
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitValue) || 100));
    return this.activitiesService.list({ page, limit }, false, eventSlug);
  }
}
