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
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.applicationsService.list({
      status,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.applicationsService.getById(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.applicationsService.update(id, dto, actor.sub);
  }

  @Post(':id/convert-to-speaker')
  @HttpCode(HttpStatus.CREATED)
  async convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AccessTokenPayload) {
    return this.applicationsService.convertToSpeaker(id, actor.sub);
  }
}
