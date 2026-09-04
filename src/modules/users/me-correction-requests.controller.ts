import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CorrectionRequestsService } from './correction-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { CreateCorrectionRequestDto } from './dto/create-correction-request.dto';

/** /me/* -- siempre "quien está autenticado ahora", nunca un id parametrizado. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('me/correction-requests')
@UseGuards(JwtAuthGuard)
export class MeCorrectionRequestsController {
  constructor(private readonly correctionRequestsService: CorrectionRequestsService) {}

  @Post()
  async create(
    @Body() dto: CreateCorrectionRequestDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.correctionRequestsService.create(user.sub, dto);
  }
}
