import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateCareerDto } from './dto/create-career.dto';
import { UpdateCareerDto } from './dto/update-career.dto';

/** Facultades + carreras: acopladas por unique_career_per_faculty, un solo servicio. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listFaculties() {
    return this.prisma.faculty.findMany({ orderBy: { name: 'asc' } });
  }

  async createFaculty(dto: CreateFacultyDto) {
    try {
      return await this.prisma.faculty.create({ data: { name: dto.name } });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'faculties_name_key')) {
        throw new AppException(409, 'DUPLICATE_FACULTY', 'Ya existe una facultad con ese nombre.');
      }
      throw error;
    }
  }

  async updateFaculty(id: string, dto: UpdateFacultyDto) {
    try {
      return await this.prisma.faculty.update({ where: { id }, data: { name: dto.name } });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'faculties_name_key')) {
        throw new AppException(409, 'DUPLICATE_FACULTY', 'Ya existe una facultad con ese nombre.');
      }
      throw error;
    }
  }

  listCareers(facultyId?: string) {
    return this.prisma.career.findMany({
      where: facultyId ? { facultyId } : undefined,
      include: { faculty: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCareer(dto: CreateCareerDto) {
    const faculty = await this.prisma.faculty.findUnique({ where: { id: dto.facultyId } });
    if (!faculty) {
      throw new AppException(422, 'INVALID_FACULTY', 'La facultad indicada no existe.');
    }
    try {
      return await this.prisma.career.create({
        data: { facultyId: dto.facultyId, name: dto.name },
        include: { faculty: true },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'careers_faculty_id_name_key')) {
        throw new AppException(
          409,
          'DUPLICATE_CAREER',
          'Ya existe una carrera con ese nombre en esta facultad.',
        );
      }
      throw error;
    }
  }

  async updateCareer(id: string, dto: UpdateCareerDto) {
    if (dto.facultyId !== undefined) {
      const faculty = await this.prisma.faculty.findUnique({ where: { id: dto.facultyId } });
      if (!faculty) {
        throw new AppException(422, 'INVALID_FACULTY', 'La facultad indicada no existe.');
      }
    }
    try {
      return await this.prisma.career.update({
        where: { id },
        data: { facultyId: dto.facultyId, name: dto.name },
        include: { faculty: true },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'careers_faculty_id_name_key')) {
        throw new AppException(
          409,
          'DUPLICATE_CAREER',
          'Ya existe una carrera con ese nombre en esta facultad.',
        );
      }
      throw error;
    }
  }
}
