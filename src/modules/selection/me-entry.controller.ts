import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SelectionService } from './selection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { EventAccessGuard } from '../event-access/event-access.guard';

@ApiTags('selection')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
export class MeEntryController {
  constructor(private readonly selectionService: SelectionService) {}

  @Get('entry')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @Roles('ALUMNO')
  getMyEntry(@CurrentUser() user: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.selectionService.getMyEntry(user.sub, eventSlug);
  }
}
