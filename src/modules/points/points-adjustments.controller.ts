import { Body, Controller, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PointsAdjustmentsService } from './points-adjustments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { CreatePointAdjustmentDto } from './dto/create-adjustment.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';
import { EventAccessGuard } from '../event-access/event-access.guard';

/** RF-330, RF-331: correcciones administrativas, siempre con motivo. Nunca accesible a STAFF. */
@ApiTags('points')
@ApiBearerAuth()
@Controller('points')
@UseGuards(JwtAuthGuard, RolesGuard, EventAccessGuard)
@Roles('ADMIN')
export class PointsAdjustmentsController {
  constructor(private readonly pointsAdjustmentsService: PointsAdjustmentsService) {}

  @Post('adjustments')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week', description: 'Evento al que se asignan los puntos; por omisión tedxucb.' })
  createAdjustment(@Body() dto: CreatePointAdjustmentDto, @CurrentUser() actor: AccessTokenPayload, @Query('eventSlug') eventSlug = 'tedxucb') {
    return this.pointsAdjustmentsService.createAdjustment(dto, actor.sub, eventSlug);
  }

  @Post(':transactionId/reverse')
  @ApiQuery({ name: 'eventSlug', required: false, example: 'innovation-week', description: 'La reversión solo encuentra movimientos del evento autorizado.' })
  reverse(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: ReverseTransactionDto,
    @CurrentUser() actor: AccessTokenPayload,
    @Query('eventSlug') eventSlug = 'tedxucb',
  ) {
    return this.pointsAdjustmentsService.reverseTransaction(transactionId, dto, actor.sub, eventSlug);
  }
}
