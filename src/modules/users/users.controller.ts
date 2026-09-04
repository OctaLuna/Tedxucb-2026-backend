import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token-pair.service';
import type { Role } from '../auth/auth.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GrantRoleDto } from './dto/grant-role.dto';

/** Cuentas de staff/admin -- los alumnos se gestionan en `profiles` (GET /students). */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.usersService.createUser(dto, actor.sub);
  }

  @Get()
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.usersService.listUsers(Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.usersService.updateUser(id, dto, actor.sub);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Param('id') id: string, @CurrentUser() actor: AccessTokenPayload) {
    return this.usersService.disableUser(id, actor.sub);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Param('id') id: string, @CurrentUser() actor: AccessTokenPayload) {
    return this.usersService.enableUser(id, actor.sub);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.OK)
  async grantRole(
    @Param('id') id: string,
    @Body() dto: GrantRoleDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.usersService.grantRole(id, dto.role, actor.sub);
  }

  @Delete(':id/roles/:role')
  @HttpCode(HttpStatus.OK)
  async revokeRole(
    @Param('id') id: string,
    @Param('role') role: Role,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.usersService.revokeRole(id, role, actor.sub);
  }
}
