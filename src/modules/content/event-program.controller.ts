import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventAccessGuard } from '../event-access/event-access.guard';
import { CreateEventProgramItemDto } from './dto/create-event-program-item.dto';
import { UpdateEventProgramItemDto } from './dto/update-event-program-item.dto';
import { EventProgramService } from './event-program.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

@ApiTags('event-program')
@ApiBearerAuth()
@Controller('event-program')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
@Roles('ADMIN')
export class EventProgramController {
  constructor(private readonly eventProgram: EventProgramService) {}

  @Get()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'PUBLISHED', 'CANCELLED'] })
  list(@Query('eventSlug') eventSlug = 'tedxucb', @Query('status') status?: string) {
    return this.eventProgram.listAdmin(eventSlug, status);
  }

  @Post()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  create(@Body() dto: CreateEventProgramItemDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.eventProgram.create(dto, actor.sub, eventSlug);
  }

  @Patch(':id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventProgramItemDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.eventProgram.update(id, dto, actor.sub, eventSlug);
  }
}

@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicEventProgramController {
  constructor(private readonly eventProgram: EventProgramService) {}

  @Get('program')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'tedxucb' })
  @RateLimit({ keyPrefix: 'public-event-program', limit: 60, windowSeconds: 60 })
  list(@Query('eventSlug') eventSlug = 'tedxucb') {
    return this.eventProgram.listPublic(eventSlug);
  }
}
