import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventAccessGuard } from '../event-access/event-access.guard';
import { CreateEventLiveActivityDto, UpdateEventLiveActivityDto, UpdateEventLiveSettingsDto } from './dto/event-live.dto';
import { EventLiveService } from './event-live.service';

@ApiTags('event-live')
@ApiBearerAuth()
@Controller('event-live')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
@Roles('ADMIN')
export class EventLiveController {
  constructor(private readonly live: EventLiveService) {}

  @Get()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  get(@Query('eventSlug') eventSlug = 'tedxucb') { return this.live.getAdmin(eventSlug); }

  @Put()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  updateSettings(@Body() dto: UpdateEventLiveSettingsDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.live.updateSettings(dto, eventSlug);
  }

  @Post('activities')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  create(@Body() dto: CreateEventLiveActivityDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.live.create(dto, actor.sub, eventSlug);
  }

  @Patch('activities/:id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventLiveActivityDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.live.update(id, dto, actor.sub, eventSlug);
  }

  @Delete('activities/:id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.live.cancel(id, actor.sub, eventSlug);
  }
}

@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicEventLiveController {
  constructor(private readonly live: EventLiveService) {}

  @Get('live')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  @RateLimit({ keyPrefix: 'public-event-live', limit: 60, windowSeconds: 60 })
  get(@Query('eventSlug') eventSlug = 'tedxucb') { return this.live.getPublic(eventSlug); }
}
