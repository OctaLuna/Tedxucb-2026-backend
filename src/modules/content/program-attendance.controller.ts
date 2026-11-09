import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { ProgramAttendanceService } from './program-attendance.service';

class ConfirmProgramAttendanceDto {
  @IsString()
  @Length(40, 60)
  token!: string;
}

@ApiTags('program-attendance')
@ApiBearerAuth()
@Controller('me/program-attendance')
@UseGuards(JwtAuthGuard)
export class ProgramAttendanceController {
  constructor(private readonly attendance: ProgramAttendanceService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.attendance.myProgramStatus(user.sub, 'innovation-week');
  }

  @Put()
  confirm(@CurrentUser() user: AccessTokenPayload, @Body() dto: ConfirmProgramAttendanceDto) {
    return this.attendance.confirm(user.sub, dto.token);
  }

  @Post('preview')
  preview(@CurrentUser() user: AccessTokenPayload, @Body() dto: ConfirmProgramAttendanceDto) {
    return this.attendance.preview(user.sub, dto.token);
  }
}
