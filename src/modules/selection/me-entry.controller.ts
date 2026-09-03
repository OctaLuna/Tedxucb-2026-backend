import { Controller, Get, UseGuards } from '@nestjs/common';
import { SelectionService } from './selection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeEntryController {
  constructor(private readonly selectionService: SelectionService) {}

  @Get('entry')
  @Roles('ALUMNO')
  getMyEntry(@CurrentUser() user: AccessTokenPayload) {
    return this.selectionService.getMyEntry(user.sub);
  }
}
