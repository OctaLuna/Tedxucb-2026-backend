import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { AvatarBridgeTokenService } from '../auth/avatar-bridge-token.service';
import type { EnvConfig } from '../../config/env.validation';

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

interface InnovationRankedRow {
  student_id: string;
  full_name: string;
  career: string | null;
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

type AvatarReference = {
  contractVersion: 1;
  provider: 'avatar-2d';
  avatarId: string;
  revision: string;
  preview: { mediaType: 'image/png'; url: string };
};

type AvatarReferenceLookupResponse = {
  data?: Array<{ identitySub?: unknown; reference?: unknown }>;
};

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
  private readonly logger = new Logger(LeaderboardService.name);
  private warnedMissingAvatarConfig = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly avatarBridge: AvatarBridgeTokenService,
  ) {}

  async getLeaderboard(filters: LeaderboardFilters, limit = DEFAULT_LIMIT, eventSlug = 'tedxucb') {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const where = this.buildWhere(filters);
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, slug: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');

    if (eventSlug === 'innovation-week') {
      const rows = await this.prisma.$queryRaw<InnovationRankedRow[]>`
        SELECT u.id AS student_id, COALESCE(NULLIF(u.nickname, ''), u.full_name) AS full_name,
               c.name AS career, COALESCE(esp.total_points, 0) AS total_points,
               RANK() OVER (ORDER BY COALESCE(esp.total_points, 0) DESC, u.created_at ASC, u.id ASC) AS position,
               COUNT(*) OVER() AS total_count
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'ALUMNO'
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN careers c ON c.id = sp.career_id
        LEFT JOIN event_student_points esp ON esp.student_id = u.id AND esp.event_id = ${event.id}::uuid
        WHERE u.status = 'ACTIVE'
          AND (
            (u.email LIKE '%@ucb.edu.bo' AND EXISTS (
              SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id AND ui.provider = 'GOOGLE'
                AND ui.verified_email = u.email AND ui.hosted_domain = 'ucb.edu.bo'
            )) OR EXISTS (
              SELECT 1 FROM event_email_access access WHERE access.event_id = ${event.id}::uuid
                AND access.email_normalized = u.email AND access.revoked_at IS NULL
            )
          )
          ${filters.career ? Prisma.sql`AND sp.career_id = ${filters.career}::uuid` : Prisma.empty}
          ${filters.faculty ? Prisma.sql`AND c.faculty_id = ${filters.faculty}::uuid` : Prisma.empty}
        ORDER BY position
        LIMIT ${clampedLimit}
      `;
      const avatarReferences = await this.lookupAvatarReferences(rows.map((row) => row.student_id));
      return {
        data: rows.map((row) => ({
          position: Number(row.position), studentId: row.student_id, fullName: row.full_name,
          career: row.career, totalPoints: row.total_points,
          ...(avatarReferences.has(row.student_id) ? { avatar: avatarReferences.get(row.student_id) } : {}),
        })),
        meta: { totalStudents: rows.length > 0 ? Number(rows[0].total_count) : 0, generatedAt: new Date().toISOString() },
      };
    }

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

  private async lookupAvatarReferences(identitySubs: string[]): Promise<Map<string, AvatarReference>> {
    const baseUrl = this.config.get('AVATAR_2D_API_BASE_URL', { infer: true });
    if (!baseUrl || identitySubs.length === 0) {
      if (!baseUrl && !this.warnedMissingAvatarConfig) {
        this.warnedMissingAvatarConfig = true;
        this.logger.warn('AVATAR_2D_API_BASE_URL no está configurada; el ranking seguirá sin vistas previas de avatar.');
      }
      return new Map();
    }

    try {
      const endpoint = new URL('identity/references', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
      const { token } = this.avatarBridge.issueLeaderboardLookup();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ identitySubs }),
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) {
        this.logger.warn(`Avatar 2D no devolvió referencias para el ranking (HTTP ${response.status}).`);
        return new Map();
      }

      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray((payload as AvatarReferenceLookupResponse).data)) {
        this.logger.warn('Avatar 2D devolvió una respuesta de referencias con formato inválido.');
        return new Map();
      }

      const allowedIds = new Set(identitySubs);
      const base = new URL(baseUrl);
      const expectedPreviewPrefix = `${base.pathname.replace(/\/$/, '')}/previews/`;
      const references = new Map<string, AvatarReference>();
      for (const entry of (payload as AvatarReferenceLookupResponse).data ?? []) {
        const identitySub = entry.identitySub;
        const candidate = entry.reference;
        if (typeof identitySub !== 'string' || !allowedIds.has(identitySub) || references.has(identitySub) ||
            !candidate || typeof candidate !== 'object') continue;
        const reference = candidate as Partial<AvatarReference>;
        const previewUrl = reference.preview?.url;
        if (reference.contractVersion !== 1 || reference.provider !== 'avatar-2d' ||
            typeof reference.avatarId !== 'string' || typeof reference.revision !== 'string' ||
            reference.preview?.mediaType !== 'image/png' || typeof previewUrl !== 'string') continue;
        try {
          const preview = new URL(previewUrl);
          if (preview.origin !== base.origin || !preview.pathname.startsWith(expectedPreviewPrefix) ||
              !['https:', 'http:'].includes(preview.protocol)) continue;
        } catch { continue; }
        references.set(identitySub, reference as AvatarReference);
      }
      return references;
    } catch (error) {
      this.logger.warn(`No se pudieron consultar las referencias Avatar 2D para el ranking: ${error instanceof Error ? error.message : 'error desconocido'}.`);
      return new Map();
    }
  }

  /**
   * GET /me/progress. Un alumno fuera de la población clasificada (no
   * ACTIVE -- p. ej. todavía PENDING) no aparece en el ranking: rank queda
   * null en vez de fallar, degradación explícita, no un error.
   */
  async getStudentProgress(studentId: string, eventSlug = 'tedxucb') {
    const event = await this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, slug: true } });
    if (!event) throw new AppException(404, 'EVENT_NOT_FOUND', 'Evento no encontrado.');
    if (eventSlug === 'innovation-week') {
      const rows = await this.prisma.$queryRaw<Array<{ position: bigint | number; total_count: bigint | number }>>`
        SELECT position, total_count FROM (
          SELECT u.id AS student_id,
            RANK() OVER (ORDER BY COALESCE(esp.total_points, 0) DESC, u.created_at ASC, u.id ASC) AS position,
            COUNT(*) OVER() AS total_count
          FROM users u
          JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'ALUMNO'
          LEFT JOIN event_student_points esp ON esp.student_id = u.id AND esp.event_id = ${event.id}::uuid
          WHERE u.status = 'ACTIVE'
            AND ((u.email LIKE '%@ucb.edu.bo' AND EXISTS (
              SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id AND ui.provider = 'GOOGLE'
                AND ui.verified_email = u.email AND ui.hosted_domain = 'ucb.edu.bo'
            )) OR EXISTS (
              SELECT 1 FROM event_email_access access WHERE access.event_id = ${event.id}::uuid
                AND access.email_normalized = u.email AND access.revoked_at IS NULL
            ))
        ) ranked WHERE student_id = ${studentId}::uuid
      `;
      const points = await this.prisma.eventStudentPoints.findUnique({
        where: { eventId_studentId: { eventId: event.id, studentId } }, select: { totalPoints: true },
      });
      const [count] = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS total FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'ALUMNO'
        WHERE u.status = 'ACTIVE'
          AND ((u.email LIKE '%@ucb.edu.bo' AND EXISTS (
            SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id AND ui.provider = 'GOOGLE'
              AND ui.verified_email = u.email AND ui.hosted_domain = 'ucb.edu.bo'
          )) OR EXISTS (
            SELECT 1 FROM event_email_access access WHERE access.event_id = ${event.id}::uuid
              AND access.email_normalized = u.email AND access.revoked_at IS NULL
          ))
      `;
      return {
        totalPoints: points?.totalPoints ?? 0,
        rank: rows.length > 0 ? Number(rows[0].position) : null,
        totalStudents: Number(count?.total ?? 0n),
      };
    }
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
