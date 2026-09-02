import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { PointsAdjustmentsService } from './points-adjustments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { CreatePointAdjustmentDto } from './dto/create-adjustment.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

/** RF-330, RF-331: correcciones administrativas, siempre con motivo. Nunca accesible a STAFF. */
@Controller('points')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PointsAdjustmentsController {
  constructor(private readonly pointsAdjustmentsService: PointsAdjustmentsService) {}

  @Post('adjustments')
  createAdjustment(@Body() dto: CreatePointAdjustmentDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.pointsAdjustmentsService.createAdjustment(dto, actor.sub);
  }

  @Post(':transactionId/reverse')
  reverse(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: ReverseTransactionDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.pointsAdjustmentsService.reverseTransaction(transactionId, dto, actor.sub);
  }
}
