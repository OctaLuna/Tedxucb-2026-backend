import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CreateApplicationDto } from './dto/create-application.dto';

/** /api/v1/public/* -- sin autenticación, necesita límite propio (skill seguridad-y-roles). */
@ApiTags('public')
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @RateLimit({ keyPrefix: 'public-applications', limit: 5, windowSeconds: 3600 })
  async create(@Body() dto: CreateApplicationDto, @Ip() ip: string, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.applicationsService.create(dto, ip, eventSlug);
  }
}
