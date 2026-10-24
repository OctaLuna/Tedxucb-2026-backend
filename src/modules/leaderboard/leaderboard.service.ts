import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

interface RankedRow {
  student_id: string;
  full_name: string;
  career: string;
  total_points: number;
  position: bigint | number;
  total_count: bigint | number;
}

interface ExportRow {
  student_code: string;
  full_name: string;
  career: string;
  faculty: string;
  total_points: number;
  position: bigint | number;
}

export interface LeaderboardFilters {
  career?: string;
  faculty?: string;
}

/**
 * RF-338/RF-339: RANK() OVER, desempate por quien llegó primero a ese
 * puntaje (MAX(created_at) del alumno, ASC). Prisma no expresa funciones de
 * ventana -- $queryRaw con Prisma.sql para el filtro, evita concatenar
 * strings a mano (misma disciplina que ya usa LedgerService/
 * ReconciliationService con $queryRaw).
 */
@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(filters: LeaderboardFilters, limit = DEFAULT_LIMIT, eventSlug = 'tedxucb') {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const where = this.buildWhere(filters);
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, slug: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');

    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      SELECT sp.user_id AS student_id, u.full_name, c.name AS career,
             COALESCE(esp.total_points, 0) AS total_points,
             RANK() OVER (
               ORDER BY COALESCE(esp.total_points, 0) DESC,
                 (SELECT MAX(pt.created_at) FROM point_transactions pt
                  LEFT JOIN point_transaction_event_ownership ownership ON ownership.point_transaction_id = pt.id
                  WHERE pt.student_id = sp.user_id
                    AND (ownership.event_id = ${event.id}::uuid OR (ownership.point_transaction_id IS NULL AND ${eventSlug} = 'tedxucb'))) ASC
             ) AS position,
             COUNT(*) OVER() AS total_count
      FROM student_profiles sp
      JOIN users u ON u.id = sp.user_id
      JOIN careers c ON c.id = sp.career_id
      LEFT JOIN event_student_points esp ON esp.student_id = sp.user_id AND esp.event_id = ${event.id}::uuid
      WHERE ${where}
      ORDER BY position
      LIMIT ${clampedLimit}
    `;

    return {
      data: rows.map((row) => ({
        position: Number(row.position),
        studentId: row.student_id,
        fullName: row.full_name,
        career: row.career,
        totalPoints: row.total_points,
      })),
      meta: { totalStudents: rows.length > 0 ? Number(rows[0].total_count) : 0, generatedAt: new Date().toISOString() },
    };
  }

  /**
   * GET /me/progress. Un alumno fuera de la población clasificada (no
   * ACTIVE -- p. ej. todavía PENDING) no aparece en el ranking: rank queda
   * null en vez de fallar, degradación explícita, no un error.
   */
  async getStudentProgress(studentId: string, eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, slug: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    await this.prisma.studentProfile.findUniqueOrThrow({ where: { userId: studentId } });

    const rows = await this.prisma.$queryRaw<Array<{ position: bigint | number; total_count: bigint | number }>>`
      SELECT position, total_count FROM (
        SELECT sp.user_id AS student_id,
               COALESCE(esp.total_points, 0) AS total_points,
               RANK() OVER (
                 ORDER BY COALESCE(esp.total_points, 0) DESC,
                   (SELECT MAX(pt.created_at) FROM point_transactions pt
                    LEFT JOIN point_transaction_event_ownership ownership ON ownership.point_transaction_id = pt.id
                    WHERE pt.student_id = sp.user_id
                      AND (ownership.event_id = ${event.id}::uuid OR (ownership.point_transaction_id IS NULL AND ${event.slug} = 'tedxucb'))) ASC
               ) AS position,
               COUNT(*) OVER() AS total_count
        FROM student_profiles sp
        JOIN users u ON u.id = sp.user_id
        LEFT JOIN event_student_points esp ON esp.student_id = sp.user_id AND esp.event_id = ${event.id}::uuid
        WHERE u.status = 'ACTIVE'
      ) ranked
      WHERE student_id = ${studentId}::uuid
    `;

    const points = await this.prisma.eventStudentPoints.findUnique({
      where: { eventId_studentId: { eventId: event.id, studentId } },
      select: { totalPoints: true },
    });
    return {
      totalPoints: points?.totalPoints ?? 0,
      rank: rows.length > 0 ? Number(rows[0].position) : null,
      totalStudents: rows.length > 0 ? Number(rows[0].total_count) : await this.countActiveStudents(),
    };
  }

  /**
   * GET /leaderboard/export -- sin límite, incluye código y facultad para
   * uso operativo. Acceso masivo al padrón: queda auditado (skill
   * seguridad-y-roles), mismo criterio que StudentsService.exportCsv de
   * 001-d.
   */
  async exportCsv(filters: LeaderboardFilters, actorId: string, eventSlug = 'tedxucb'): Promise<string> {
    const where = this.buildWhere(filters);
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');

    const rows = await this.prisma.$queryRaw<ExportRow[]>`
      SELECT sp.student_code, u.full_name, c.name AS career, f.name AS faculty,
             COALESCE(esp.total_points, 0) AS total_points,
             RANK() OVER (
               ORDER BY COALESCE(esp.total_points, 0) DESC,
                 (SELECT MAX(pt.created_at) FROM point_transactions pt
                  LEFT JOIN point_transaction_event_ownership ownership ON ownership.point_transaction_id = pt.id
                  WHERE pt.student_id = sp.user_id
                    AND (ownership.event_id = ${event.id}::uuid OR (ownership.point_transaction_id IS NULL AND ${eventSlug} = 'tedxucb'))) ASC
             ) AS position
      FROM student_profiles sp
      JOIN users u ON u.id = sp.user_id
      JOIN careers c ON c.id = sp.career_id
      JOIN faculties f ON f.id = c.faculty_id
      LEFT JOIN event_student_points esp ON esp.student_id = sp.user_id AND esp.event_id = ${event.id}::uuid
      WHERE ${where}
      ORDER BY position
    `;

    const header = ['Posición', 'Código', 'Nombre', 'Carrera', 'Facultad', 'Puntos'];
    const lines = rows.map((row) => [
      String(row.position),
      row.student_code,
      row.full_name,
      row.career,
      row.faculty,
      String(row.total_points),
    ]);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'LEADERBOARD_EXPORTED',
        entityType: 'leaderboard',
        detail: { ...filters, rowCount: rows.length },
      },
    });

    // BOM UTF-8: sin esto, Excel en Windows rompe tildes/ñ (mismo bug ya
    // corregido en StudentsService.exportCsv de 001-d).
    const csvRows = [header, ...lines].map((fields) => fields.map(this.csvField).join(','));
    return '﻿' + csvRows.join('\r\n');
  }

  private async countActiveStudents(): Promise<number> {
    return this.prisma.studentProfile.count({ where: { user: { status: 'ACTIVE' } } });
  }

  private buildWhere(filters: LeaderboardFilters): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`u.status = 'ACTIVE'`];
    if (filters.career) {
      conditions.push(Prisma.sql`sp.career_id = ${filters.career}::uuid`);
    }
    if (filters.faculty) {
      conditions.push(Prisma.sql`c.faculty_id = ${filters.faculty}::uuid`);
    }
    return Prisma.join(conditions, ' AND ');
  }

  private csvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
