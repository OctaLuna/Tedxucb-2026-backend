import { Body, Controller, HttpCode, HttpStatus, Ip, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CheckinService } from './checkin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ActivityStaffGuard } from './guards/activity-staff.guard';
import { CheckinDto } from './dto/checkin.dto';
import { ManualCheckinDto } from './dto/manual-checkin.dto';

/**
 * Rol STAFF o ADMIN, Y ADEMÁS asignado a :activityId (ActivityStaffGuard,
 * corre después de RolesGuard para no consultar la asignación de alguien
 * que ni siquiera tiene el rol). RateLimitGuard/T100 (límite diferenciado
 * de check-in, picos legítimos vs. spam) queda para el pulido del Grupo 9.
 */
@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard, ActivityStaffGuard)
@Roles('STAFF', 'ADMIN')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post(':activityId/checkin')
  async checkin(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: CheckinDto,
    @CurrentUser() staff: AccessTokenPayload,
    @Ip() ip: string,
  ) {
    return this.checkinService.checkinByScan(activityId, staff.sub, dto, ip);
  }

  @Post(':activityId/checkin/manual')
  @HttpCode(HttpStatus.CREATED)
  async checkinManual(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: ManualCheckinDto,
    @CurrentUser() staff: AccessTokenPayload,
    @Ip() ip: string,
  ) {
    return this.checkinService.checkinManual(activityId, staff.sub, dto, ip);
  }
}
