import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../../common/ledger/ledger.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { CreatePointAdjustmentDto } from './dto/create-adjustment.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

/**
 * RF-330: ajustes y reversiones administrativas, siempre con motivo,
 * siempre auditadas. Construye sobre LedgerService (003-a) sin tocar su
 * firma -- recordMovement/reverseMovement ya están probados y committeados.
 */
@Injectable()
export class PointsAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async createAdjustment(dto: CreatePointAdjustmentDto, actorId: string) {
    this.assertReason(dto.reason);
    if (dto.points === 0) {
      throw new AppException(400, 'ZERO_POINTS', 'El movimiento no puede ser de cero puntos.');
    }

    const student = await this.prisma.studentProfile.findUnique({ where: { userId: dto.studentId } });
    if (!student) {
      throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.studentProfile.findUniqueOrThrow({ where: { userId: dto.studentId } });

      const transaction = await this.ledger.recordMovement(tx, {
        studentId: dto.studentId,
        points: dto.points,
        type: dto.type,
        reason: dto.reason,
        createdById: actorId,
      });

      const after = await tx.studentProfile.findUniqueOrThrow({ where: { userId: dto.studentId } });
      const truncated = after.totalPoints !== before.totalPoints + dto.points;

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'POINTS_ADJUSTMENT_CREATED',
          entityType: 'point_transaction',
          entityId: transaction.id,
          detail: { studentId: dto.studentId, type: dto.type, points: dto.points, reason: dto.reason },
        },
      });

      return { transactionId: transaction.id, newTotal: after.totalPoints, truncated };
    });
  }

  async reverseTransaction(transactionId: string, dto: ReverseTransactionDto, actorId: string) {
    this.assertReason(dto.reason);

    const original = await this.prisma.pointTransaction.findUnique({
      where: { id: transactionId },
      include: { reversedBy: true },
    });
    if (!original) {
      throw new AppException(404, 'NOT_FOUND', 'Movimiento no encontrado.');
    }
    if (original.type === 'REVERSAL') {
      throw new AppException(
        422,
        'CANNOT_REVERSE_REVERSAL',
        'No se puede revertir una reversión; emite un ajuste en su lugar.',
      );
    }
    if (original.reversedBy) {
      throw new AppException(409, 'ALREADY_REVERSED', 'Este movimiento ya fue revertido.', {
        reversalId: original.reversedBy.id,
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const reversal = await this.ledger.reverseMovement(tx, transactionId, {
          reason: dto.reason as string,
          createdById: actorId,
        });

        const updated = await tx.studentProfile.findUniqueOrThrow({ where: { userId: original.studentId } });

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'POINTS_TRANSACTION_REVERSED',
            entityType: 'point_transaction',
            entityId: reversal.id,
            detail: { reversesId: transactionId, reason: dto.reason },
          },
        });

        return { transactionId: reversal.id, reversesId: transactionId, newTotal: updated.totalPoints };
      });
    } catch (error) {
      // Segunda capa contra la carrera (dos admins revirtiendo el mismo
      // movimiento a la vez): el pre-chequeo de arriba puede perder contra
      // otra transacción concurrente; la restricción única es la garantía
      // real (mismo patrón de dos capas que profile.service.ts).
      if (isUniqueConstraintViolation(error, 'point_transactions_reverses_id_key')) {
        throw new AppException(409, 'ALREADY_REVERSED', 'Este movimiento ya fue revertido.');
      }
      throw error;
    }
  }

  private assertReason(reason: string | undefined): asserts reason is string {
    if (!reason || reason.trim().length === 0) {
      throw new AppException(400, 'REASON_REQUIRED', 'El motivo es obligatorio.');
    }
  }
}
