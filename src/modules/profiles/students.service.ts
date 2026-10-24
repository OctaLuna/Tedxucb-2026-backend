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
  eventSlug?: string;
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListStudentsFilters): Promise<PaginatedResult<Record<string, unknown>>> {
    const event = await this.resolveEvent(filters.eventSlug ?? 'tedxucb');
    const permittedEmails = await this.permittedStudentEmails(event.id);
    const where = this.scopeWhere(this.buildWhere(filters), permittedEmails);
    const [rows, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: {
          user: true,
          career: { include: { faculty: true } },
          eventPoints: { where: { eventId: event.id }, select: { totalPoints: true } },
        },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { user: { fullName: 'asc' } },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toSummary(row)),
      meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) || 1 },
    };
  }

  async detail(userId: string, eventSlug = 'tedxucb') {
    const event = await this.resolveEvent(eventSlug);
    const permittedEmails = await this.permittedStudentEmails(event.id);
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        career: { include: { faculty: true } },
        eventPoints: { where: { eventId: event.id }, select: { totalPoints: true } },
      },
    });
    if (!profile || !permittedEmails.has(profile.user.email)) {
      throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
    }
    return this.toSummary(profile);
  }

  /** RF-120. Export masivo de PII queda auditado y limitado al evento. */
  async exportCsv(filters: Omit<ListStudentsFilters, 'page' | 'limit'>, actorId: string): Promise<string> {
    const event = await this.resolveEvent(filters.eventSlug ?? 'tedxucb');
    const permittedEmails = await this.permittedStudentEmails(event.id);
    const where = this.scopeWhere(this.buildWhere({ ...filters, page: 1, limit: 1 }), permittedEmails);
    const rows = await this.prisma.studentProfile.findMany({
      where,
      include: {
        user: true,
        career: { include: { faculty: true } },
        eventPoints: { where: { eventId: event.id }, select: { totalPoints: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    await this.prisma.auditLog.create({
      data: { actorId, action: 'STUDENTS_EXPORTED', entityType: 'export', detail: { filters, rowCount: rows.length } },
    });
    const header = ['Nombre', 'Código', 'Correo', 'Carrera', 'Facultad', 'Estado', 'Puntos'];
    const lines = rows.map((row) => [
      row.user.fullName, row.studentCode, row.user.email, row.career.name, row.career.faculty.name,
      row.user.status, String(row.eventPoints[0]?.totalPoints ?? 0),
    ]);
    const csvRows = [header, ...lines].map((fields) => fields.map(this.csvField).join(','));
    return '\uFEFF' + csvRows.join('\r\n');
  }

  private async resolveEvent(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    return event;
  }

  private async permittedStudentEmails(eventId: string): Promise<Set<string>> {
    const [access, identities] = await Promise.all([
      this.prisma.eventEmailAccess.findMany({ where: { eventId, revokedAt: null }, select: { emailNormalized: true } }),
      this.prisma.userIdentity.findMany({
        where: {
          provider: 'GOOGLE',
          hostedDomain: 'ucb.edu.bo',
          verifiedEmail: { endsWith: '@ucb.edu.bo', mode: 'insensitive' },
        },
        select: { verifiedEmail: true },
      }),
    ]);
    return new Set([...access.map((row) => row.emailNormalized), ...identities.map((row) => row.verifiedEmail.toLowerCase())]);
  }

  private scopeWhere(where: Prisma.StudentProfileWhereInput, emails: Set<string>): Prisma.StudentProfileWhereInput {
    where.user = { AND: [where.user ?? {}, { email: { in: [...emails] } }] };
    return where;
  }

  private csvField(value: unknown): string {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
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
    eventPoints: Array<{ totalPoints: number }>;
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
      totalPoints: profile.eventPoints[0]?.totalPoints ?? 0,
    };
  }
}
