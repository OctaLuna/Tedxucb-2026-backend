import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContentBlocksService } from './content-blocks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CreateContentBlockDto } from './dto/create-content-block.dto';
import { UpdateContentBlockDto } from './dto/update-content-block.dto';

/** GET público (RateLimitGuard, no requiere sesión); POST/PATCH exclusivo ADMIN. */
@ApiTags('content')
@Controller('content-blocks')
@UseGuards(RateLimitGuard)
export class ContentBlocksController {
  constructor(private readonly contentBlocksService: ContentBlocksService) {}

  @Get()
  @RateLimit({ keyPrefix: 'public-content-blocks', limit: 60, windowSeconds: 60 })
  list() {
    return this.contentBlocksService.list();
  }

  @Get(':key')
  @RateLimit({ keyPrefix: 'public-content-blocks', limit: 60, windowSeconds: 60 })
  detail(@Param('key') key: string) {
    return this.contentBlocksService.getByKey(key);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContentBlockDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.contentBlocksService.create(dto, actor.sub);
  }

  @Patch(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateContentBlockDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.contentBlocksService.update(key, dto, actor.sub);
  }
}
