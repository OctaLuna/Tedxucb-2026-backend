import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { EventAccessGuard } from '../event-access/event-access.guard';

@ApiTags('speakers')
@ApiBearerAuth()
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
@Roles('ADMIN')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  async list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.applicationsService.list({
      status,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    }, eventSlug);
  }

  @Get(':id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  async detail(@Param('id', ParseUUIDPipe) id: string, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.applicationsService.getById(id, eventSlug);
  }

  @Patch(':id')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() actor: AccessTokenPayload,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.applicationsService.update(id, dto, actor.sub, eventSlug);
  }

  @Post(':id/convert-to-speaker')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @HttpCode(HttpStatus.CREATED)
  async convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.applicationsService.convertToSpeaker(id, actor.sub, eventSlug);
  }
}
