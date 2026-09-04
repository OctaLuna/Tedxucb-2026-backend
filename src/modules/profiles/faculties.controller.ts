import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';

/** GET público (el registro lo necesita sin sesión); POST/PATCH exclusivo ADMIN. */
@ApiTags('profiles')
@Controller('faculties')
export class FacultiesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  async list() {
    return this.catalogService.listFaculties();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async create(@Body() dto: CreateFacultyDto) {
    return this.catalogService.createFaculty(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacultyDto) {
    return this.catalogService.updateFaculty(id, dto);
  }
}
