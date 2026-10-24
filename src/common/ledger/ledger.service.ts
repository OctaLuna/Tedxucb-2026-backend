import { Injectable } from '@nestjs/common';
import type { Prisma, PointTransaction } from '@prisma/client';

export type LedgerTransactionType = 'ACTIVITY' | 'BONUS' | 'PENALTY' | 'ADJUSTMENT' | 'REVERSAL';

export interface RecordMovementInput {
  eventId: string;
  studentId: string;
  points: number;
  type: LedgerTransactionType;
  activityId?: string;
  attendanceId?: string;
  reversesId?: string;
  reason?: string;
  createdById?: string;
  idempotencyKey?: string;
}

export interface ReverseMovementInput {
  reason: string;
  createdById?: string;
}

/**
 * Artículo IV: única puerta de escritura hacia point_transactions y
 * student_profiles.total_points. Infraestructura compartida (como
 * PrismaService/MailModule), no un módulo de negocio -- no cuenta contra el
 * límite de 3 módulos de la feature (plan.md de 003, Registro de
 * complejidad). La usan `activities` (check-in, cancelación con reversión
 * en bloque) y `points` (ajustes/bonos/penalizaciones/reversiones
 * administrativas).
 */
@Injectable()
export class LedgerService {
  /**
   * Inserta el movimiento y actualiza la caché de puntaje en la MISMA
   * transacción del llamador (recibe `tx`, nunca abre la suya propia).
   * Bloquea la fila del alumno antes de leer su total -- un SELECT sin
   * bloqueo pierde la carrera ante dos movimientos concurrentes del mismo
   * alumno (skill motor-de-puntos, Invariante 5).
   */
  async recordMovement(tx: Prisma.TransactionClient, input: RecordMovementInput): Promise<PointTransaction> {
    const { eventId, ...transactionInput } = input;
    await tx.$queryRaw`SELECT set_config('ted.event_id', ${eventId}, true)`;
    const transaction = await tx.pointTransaction.create({
      data: transactionInput as Prisma.PointTransactionUncheckedCreateInput,
    });

    await tx.$queryRaw`SELECT 1 FROM student_profiles WHERE user_id = ${input.studentId}::uuid FOR UPDATE`;
    const current = await tx.studentProfile.findUniqueOrThrow({ where: { userId: input.studentId } });

    // Trunca a cero -- RF-328. El CHECK total_points_non_negative en el
    // motor es la garantía real; esto evita que el propio código intente
    // escribir un negativo y choque con el CHECK en el camino feliz.
    const nextTotal = Math.max(0, current.totalPoints + input.points);
    await tx.studentProfile.update({ where: { userId: input.studentId }, data: { totalPoints: nextTotal } });

    return transaction;
  }

  /**
   * Crea el movimiento inverso que apunta al original -- nunca edita ni
   * borra (RF-325, RF-326). La restricción única sobre reverses_id impide
   * revertir dos veces el mismo movimiento; el llamador traduce esa
   * violación con isUniqueConstraintViolation(error,
   * 'point_transactions_reverses_id_key') a 409 ALREADY_REVERSED.
   */
  async reverseMovement(
    tx: Prisma.TransactionClient,
    originalId: string,
    input: ReverseMovementInput,
  ): Promise<PointTransaction> {
    const original = await tx.pointTransaction.findUniqueOrThrow({
      where: { id: originalId }, include: { eventOwnership: true },
    });
    const eventId = original.eventOwnership?.eventId ?? (await tx.event.findUniqueOrThrow({ where: { slug: 'tedxucb' } })).id;
    return this.recordMovement(tx, {
      eventId,
      studentId: original.studentId,
      points: -original.points,
      type: 'REVERSAL',
      activityId: original.activityId ?? undefined,
      reversesId: original.id,
      reason: input.reason,
      createdById: input.createdById,
    });
  }
}
