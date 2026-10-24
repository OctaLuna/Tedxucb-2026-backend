import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { EventAccessService } from './event-access.service';
import { SetEventAccessDto } from './dto/set-event-access.dto';
import { ListEventAccessQueryDto } from './dto/list-event-access-query.dto';
import { AllowIncompleteProfile } from '../auth/decorators/allow-incomplete-profile.decorator';

@ApiTags('event-access')
@ApiBearerAuth()
@Controller('admin/event-access')
@UseGuards(JwtAuthGuard)
export class EventAccessController {
  constructor(private readonly access: EventAccessService) {}

  @Get()
  async list(@CurrentUser() actor: AccessTokenPayload, @Query() query: ListEventAccessQueryDto) {
    await this.access.assertAdmin(actor.sub);
    return this.access.list(actor.sub, query);
  }

  @Post()
  async set(@CurrentUser() actor: AccessTokenPayload, @Body() dto: SetEventAccessDto) {
    await this.access.assertAdmin(actor.sub);
    return this.access.set(actor.sub, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertAdmin(actor.sub);
    await this.access.revoke(id, actor.sub);
  }
}

@ApiTags('event-access')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MyEventAccessController {
  constructor(private readonly access: EventAccessService) {}

  @Get('events')
  @AllowIncompleteProfile()
  events(@CurrentUser() actor: AccessTokenPayload) {
    return this.access.eventsForUser(actor.sub);
  }
}
