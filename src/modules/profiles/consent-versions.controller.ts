import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConsentVersionsService } from './consent-versions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { CreateConsentVersionDto } from './dto/create-consent-version.dto';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('consent-versions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ConsentVersionsController {
  constructor(private readonly consentVersionsService: ConsentVersionsService) {}

  @Get()
  async list() {
    return this.consentVersionsService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateConsentVersionDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.consentVersionsService.create(dto, actor.sub);
  }
}
