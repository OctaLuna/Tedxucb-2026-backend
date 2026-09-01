import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CorrectionRequestsService } from './correction-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ResolveCorrectionRequestDto } from './dto/resolve-correction-request.dto';

@Controller('correction-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CorrectionRequestsController {
  constructor(private readonly correctionRequestsService: CorrectionRequestsService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.correctionRequestsService.list(Number(page) || 1, Number(limit) || 20, status);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveCorrectionRequestDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.correctionRequestsService.resolve(id, dto, actor.sub);
  }
}
