import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';

export interface ReconciliationReport {
  studentId: string;
  studentCode: string;
  cachedTotal: number;
  ledgerSum: number;
  consistent: boolean;
  transactionCount: number;
}

interface DiscrepancyRow {
  student_id: string;
  student_code: string;
  cached_total: number;
  ledger_sum: bigint | number;
  transaction_count: bigint | number;
}

/**
 * RF-324, RF-332, RF-333. Invocable sin HTTP (Artículo I): lo usa tanto
 * points-cli (operador, con --fix) como el job programado (solo alerta,
 * nunca corrige sola -- ver reconciliation.processor.ts).
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async checkStudent(studentId: string): Promise<ReconciliationReport> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: studentId } });
    if (!profile) {
      throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
    }

    const aggregate = await this.prisma.pointTransaction.aggregate({
      where: { studentId },
      _sum: { points: true },
      _count: true,
    });
    const ledgerSum = aggregate._sum.points ?? 0;

    return {
      studentId,
      studentCode: profile.studentCode,
      cachedTotal: profile.totalPoints,
      ledgerSum,
      consistent: profile.totalPoints === ledgerSum,
      transactionCount: aggregate._count,
    };
  }

  /**
   * Recorre el padrón completo en una sola ida a la base (la consulta de
   * referencia de data-model.md §5, vía $queryRaw -- un bucle por alumno
   * sería N+1 sobre cientos de filas) y devuelve solo las inconsistencias
   * (RF-332): con el motor sano, la salida está vacía.
   */
  async checkAll(): Promise<ReconciliationReport[]> {
    const rows = await this.prisma.$queryRaw<DiscrepancyRow[]>`
      SELECT sp.user_id AS student_id, sp.student_code, sp.total_points AS cached_total,
             COALESCE(SUM(pt.points), 0) AS ledger_sum,
             COUNT(pt.id) AS transaction_count
      FROM student_profiles sp
      LEFT JOIN point_transactions pt ON pt.student_id = sp.user_id
      GROUP BY sp.user_id, sp.student_code, sp.total_points
      HAVING sp.total_points <> COALESCE(SUM(pt.points), 0)
    `;

    return rows.map((row) => ({
      studentId: row.student_id,
      studentCode: row.student_code,
      cachedTotal: row.cached_total,
      ledgerSum: Number(row.ledger_sum),
      consistent: false,
      transactionCount: Number(row.transaction_count),
    }));
  }

  /** RF-333: recalcula la caché desde el libro mayor y deja constancia en auditoría de quién lo ejecutó. */
  async fixStudent(studentId: string, actorId: string): Promise<ReconciliationReport> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;

      const profile = await tx.studentProfile.findUnique({ where: { userId: studentId } });
      if (!profile) {
        throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
      }

      const aggregate = await tx.pointTransaction.aggregate({
        where: { studentId },
        _sum: { points: true },
        _count: true,
      });
      const ledgerSum = aggregate._sum.points ?? 0;
      const before = profile.totalPoints;

      if (before !== ledgerSum) {
        await tx.studentProfile.update({ where: { userId: studentId }, data: { totalPoints: ledgerSum } });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'RECONCILIATION_FIX_APPLIED',
            entityType: 'student_profile',
            entityId: studentId,
            detail: { before, after: ledgerSum },
          },
        });
      }

      return {
        studentId,
        studentCode: profile.studentCode,
        cachedTotal: ledgerSum,
        ledgerSum,
        consistent: true,
        transactionCount: aggregate._count,
      };
    });
  }
}
