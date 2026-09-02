import { Body, Controller, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CreateApplicationDto } from './dto/create-application.dto';

/** /api/v1/public/* -- sin autenticación, necesita límite propio (skill seguridad-y-roles). */
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ keyPrefix: 'public-applications', limit: 5, windowSeconds: 3600 })
  async create(@Body() dto: CreateApplicationDto, @Ip() ip: string) {
    return this.applicationsService.create(dto, ip);
  }
}
