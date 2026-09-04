import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { SpeakersService } from './speakers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { CreateSpeakerDto } from './dto/create-speaker.dto';
import { UpdateSpeakerDto } from './dto/update-speaker.dto';
import { ReorderSpeakersDto } from './dto/reorder-speakers.dto';
import { SPEAKER_PHOTO_MAX_BYTES } from './speakers.constants';

/** Sin DELETE: un speaker se despublica (PATCH status:"DRAFT"), nunca se borra. */
@ApiTags('speakers')
@ApiBearerAuth()
@Controller('speakers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SpeakersController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get()
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.speakersService.list({ page: Number(page) || 1, limit: Number(limit) || 20 });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSpeakerDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.speakersService.create(dto, actor.sub);
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.speakersService.getById(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpeakerDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.speakersService.update(id, dto, actor.sub);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(@Body() dto: ReorderSpeakersDto, @CurrentUser() actor: AccessTokenPayload) {
    await this.speakersService.reorder(dto.ids, actor.sub);
    return { reordered: dto.ids.length };
  }

  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: SPEAKER_PHOTO_MAX_BYTES },
    }),
  )
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.speakersService.updatePhoto(id, file, actor.sub);
  }
}
