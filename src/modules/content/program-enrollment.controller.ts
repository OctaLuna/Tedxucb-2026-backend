import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { EventAccessGuard } from '../event-access/event-access.guard';
import { ProgramEnrollmentService } from './program-enrollment.service';

@ApiTags('program-enrollments')
@ApiBearerAuth()
@Controller('me/program-enrollments')
@UseGuards(JwtAuthGuard, EventAccessGuard)
export class ProgramEnrollmentController {
  constructor(private readonly enrollments: ProgramEnrollmentService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.enrollments.list(user.sub, eventSlug);
  }

  @Put(':programItemId')
  enroll(@CurrentUser() user: AccessTokenPayload, @Param('programItemId', ParseUUIDPipe) id: string, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.enrollments.enroll(user.sub, id, eventSlug);
  }

  @Delete(':programItemId')
  @HttpCode(204)
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('programItemId', ParseUUIDPipe) id: string, @Query('eventSlug') eventSlug = 'tedxucb'): Promise<void> {
    await this.enrollments.cancel(user.sub, id, eventSlug);
  }
}
