import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import type { PaginatedResult } from '../users/users.service';

export interface ListStudentsFilters {
  page: number;
  limit: number;
  career?: string;
  faculty?: string;
  status?: string;
  search?: string;
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListStudentsFilters): Promise<PaginatedResult<Record<string, unknown>>> {
    const where = this.buildWhere(filters);

    const [rows, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: { user: true, career: { include: { faculty: true } } },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { user: { fullName: 'asc' } },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toSummary(row)),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit) || 1,
      },
    };
  }

  async detail(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: true, career: { include: { faculty: true } } },
    });
    if (!profile) {
      throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
    }
    return this.toSummary(profile);
  }

  /** RF-120. Queda auditado: acceso masivo a datos personales (Artículo V). */
  async exportCsv(filters: Omit<ListStudentsFilters, 'page' | 'limit'>, actorId: string): Promise<string> {
    const where = this.buildWhere({ ...filters, page: 1, limit: 1 });
    const rows = await this.prisma.studentProfile.findMany({
      where,
      include: { user: true, career: { include: { faculty: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STUDENTS_EXPORTED',
        entityType: 'export',
        detail: { filters, rowCount: rows.length },
      },
    });

    const header = ['Nombre', 'Código', 'Correo', 'Carrera', 'Facultad', 'Estado', 'Puntos'];
    const lines = rows.map((row) => [
      row.user.fullName,
      row.studentCode,
      row.user.email,
      row.career.name,
      row.career.faculty.name,
      row.user.status,
      '', // totalPoints: 003 todavía no agrega la columna, ver toSummary().
    ]);

    // BOM UTF-8: sin esto, Excel en Windows interpreta el CSV como ANSI y
    // rompe tildes/ñ -- bug de correctitud, no cosmético.
    const csvRows = [header, ...lines].map((fields) => fields.map(this.csvField).join(','));
    return '﻿' + csvRows.join('\r\n');
  }

  private csvField(value: unknown): string {
    const str = String(value ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }

  private buildWhere(filters: ListStudentsFilters): Prisma.StudentProfileWhereInput {
    const where: Prisma.StudentProfileWhereInput = {};

    if (filters.career) where.careerId = filters.career;
    if (filters.faculty) where.career = { facultyId: filters.faculty };
    if (filters.status) where.user = { status: filters.status };
    if (filters.search) {
      where.OR = [
        { studentCode: { contains: filters.search, mode: 'insensitive' } },
        { user: { fullName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private toSummary(profile: {
    userId: string;
    studentCode: string;
    academicPeriod: string;
    avatarUrl: string | null;
    user: { fullName: string; email: string; status: string };
    career: { name: string; faculty: { name: string } };
  }) {
    return {
      id: profile.userId,
      fullName: profile.user.fullName,
      email: profile.user.email,
      status: profile.user.status,
      studentCode: profile.studentCode,
      career: profile.career.name,
      faculty: profile.career.faculty.name,
      academicPeriod: profile.academicPeriod,
      avatarUrl: profile.avatarUrl,
      // student_profiles.total_points todavía no existe -- lo agrega
      // 003-motor-de-puntos (no implementada). null explícito, nunca se
      // omite la clave (ver enmienda 2026-09-01 en perfil-y-catalogo.md).
      totalPoints: null,
    };
  }
}
