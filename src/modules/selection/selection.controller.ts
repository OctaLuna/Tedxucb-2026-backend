import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SelectionService } from './selection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ManualSelectionDto } from './dto/manual-selection.dto';
import { ReasonDto } from './dto/reason.dto';
import { EventAccessGuard } from '../event-access/event-access.guard';

/** RF-402 a RF-423 (tras ADR-009): todo exclusivo ADMIN. */
@ApiTags('selection')
@ApiBearerAuth()
@Controller('selection')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
@Roles('ADMIN')
export class SelectionController {
  constructor(private readonly selectionService: SelectionService) {}

  @Post('execute')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  execute(@CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.selectionService.execute(actor.sub, eventSlug);
  }

  @Post('revert')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @HttpCode(HttpStatus.OK)
  revert(@Body() dto: ReasonDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.selectionService.revert(dto.reason, actor.sub, eventSlug);
  }

  @Get()
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  getResult(@Query('eventSlug') eventSlug = 'tedxucb') {
    return this.selectionService.getResult(eventSlug);
  }

  @Post('manual')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  manual(@Body() dto: ManualSelectionDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.selectionService.manualAssign(dto, actor.sub, eventSlug);
  }

  @Post(':id/revoke')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AccessTokenPayload,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.selectionService.revokeSelection(id, dto.reason, actor.sub, eventSlug);
  }

  @Get('export')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="asistentes.csv"')
  export(@CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.selectionService.exportCsv(actor.sub, eventSlug);
  }
}
