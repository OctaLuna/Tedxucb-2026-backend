import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SelectionService } from './selection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ManualSelectionDto } from './dto/manual-selection.dto';
import { ReasonDto } from './dto/reason.dto';

/** RF-402 a RF-423 (tras ADR-009): todo exclusivo ADMIN. */
@ApiTags('selection')
@ApiBearerAuth()
@Controller('selection')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SelectionController {
  constructor(private readonly selectionService: SelectionService) {}

  @Post('execute')
  execute(@CurrentUser() actor: AccessTokenPayload) {
    return this.selectionService.execute(actor.sub);
  }

  @Post('revert')
  @HttpCode(HttpStatus.OK)
  revert(@Body() dto: ReasonDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.selectionService.revert(dto.reason, actor.sub);
  }

  @Get()
  getResult() {
    return this.selectionService.getResult();
  }

  @Post('manual')
  manual(@Body() dto: ManualSelectionDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.selectionService.manualAssign(dto, actor.sub);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.selectionService.revokeSelection(id, dto.reason, actor.sub);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="asistentes.csv"')
  export(@CurrentUser() actor: AccessTokenPayload) {
    return this.selectionService.exportCsv(actor.sub);
  }
}
