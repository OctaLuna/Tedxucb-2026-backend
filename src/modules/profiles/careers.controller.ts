import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCareerDto } from './dto/create-career.dto';
import { UpdateCareerDto } from './dto/update-career.dto';

/** GET público (el registro lo necesita sin sesión); POST/PATCH exclusivo ADMIN. */
@Controller('careers')
export class CareersController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  async list(@Query('facultyId') facultyId?: string) {
    return this.catalogService.listCareers(facultyId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async create(@Body() dto: CreateCareerDto) {
    return this.catalogService.createCareer(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCareerDto) {
    return this.catalogService.updateCareer(id, dto);
  }
}
