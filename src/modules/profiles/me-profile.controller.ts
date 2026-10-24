import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { AllowPendingAccount } from '../auth/decorators/allow-pending-account.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AVATAR_MAX_BYTES } from './profiles.constants';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('profile')
  @AllowPendingAccount()
  async getProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.profileService.getMyProfile(user.sub);
  }

  @Patch('profile')
  @AllowPendingAccount()
  async updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: AccessTokenPayload) {
    return this.profileService.updateMyProfile(user.sub, dto);
  }

  @Post('avatar')
  @AllowPendingAccount()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.profileService.updateAvatar(user.sub, file);
  }
}
