import { Injectable, Logger } from '@nestjs/common';
import type { Attendance, PointTransaction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../../common/ledger/ledger.service';
import { MailService } from '../../common/mail/mail.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { QrTokenService } from './qr-token.service';
import { ACTIVITY_STATUS, ATTENDANCE_METHOD } from './activities.constants';
import { CheckinDto } from './dto/checkin.dto';
import { ManualCheckinDto } from './dto/manual-checkin.dto';

interface PerformCheckinInput {
  activityId: string;
  studentId: string;
  staffId: string;
  method: 'STAFF_SCAN' | 'MANUAL';
  deviceHash?: string;
  ipAddress?: string;
  note?: string;
}

/**
 * Los seis pasos del contrato (contracts/checkin.md): validar identidad del
 * alumno -> verificar actividad/ventana -> transacción (asistencia +
 * movimiento de puntos + caché) -> confirmar -> notificar (fuera de la
 * transacción). El guard de staff (ActivityStaffGuard) ya corrió antes de
 * llegar acá -- este servicio no vuelve a verificar asignación.
 */
@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qrTokenService: QrTokenService,
    private readonly ledger: LedgerService,
    private readonly mail: MailService,
  ) {}

  async checkinByScan(activityId: string, staffId: string, dto: CheckinDto, ipAddress: string | undefined) {
    const { studentId } = this.qrTokenService.verify(dto.qrToken); // 400/401
    return this.performCheckin({
      activityId,
      studentId,
      staffId,
      method: ATTENDANCE_METHOD.STAFF_SCAN,
      deviceHash: dto.deviceHash,
      ipAddress,
    });
  }

  async checkinManual(activityId: string, staffId: string, dto: ManualCheckinDto, ipAddress: string | undefined) {
    return this.performCheckin({
      activityId,
      studentId: dto.studentId,
      staffId,
      method: ATTENDANCE_METHOD.MANUAL,
      note: dto.note, // manual_requires_note en el motor es la garantía real
      ipAddress,
    });
  }

  private async performCheckin(input: PerformCheckinInput) {
    // Paso 1: identidad del alumno -- RF-122, rechaza cuenta sin verificar.
    const student = await this.prisma.user.findUnique({
      where: { id: input.studentId },
      include: { studentProfile: { include: { career: true } } },
    });
    if (!student || !student.studentProfile) {
      throw new AppException(404, 'NOT_FOUND', 'Alumno no encontrado.');
    }
    if (student.status !== 'ACTIVE') {
      throw new AppException(
        403,
        'STUDENT_NOT_VERIFIED',
        'La cuenta de este alumno no está verificada todavía; no puede acumular puntos.',
      );
    }

    // Paso 2: actividad publicada + ventana de check-in abierta.
    const activity = await this.prisma.activity.findUnique({ where: { id: input.activityId } });
    if (!activity) {
      throw new AppException(404, 'NOT_FOUND', 'Actividad no encontrada.');
    }
    const now = new Date();
    if (
      activity.status !== ACTIVITY_STATUS.PUBLISHED ||
      now < activity.checkinOpensAt ||
      now > activity.checkinClosesAt
    ) {
      throw new AppException(409, 'CHECKIN_WINDOW_CLOSED', 'El registro no está disponible en este momento.', {
        opensAt: activity.checkinOpensAt,
        closesAt: activity.checkinClosesAt,
      });
    }

    const idempotencyKey = `checkin:${input.activityId}:${input.studentId}`;

    let attendance: Attendance;
    let transaction: PointTransaction;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Paso 3: INSERT attendances -- multipleAllowed copiado AHORA, no
        // referenciado en vivo (índice único parcial no consulta otra tabla).
        const newAttendance = await tx.attendance.create({
          data: {
            activityId: input.activityId,
            studentId: input.studentId,
            method: input.method,
            multipleAllowed: activity.allowMultipleCheckins,
            validatedById: input.staffId,
            note: input.note,
            deviceHash: input.deviceHash,
            ipAddress: input.ipAddress,
          },
        });

        // Paso 4: INSERT point_transactions + bloqueo + UPDATE total_points.
        const newTransaction = await this.ledger.recordMovement(tx, {
          studentId: input.studentId,
          points: activity.pointsValue, // valor CAPTURADO -- RF-306
          type: 'ACTIVITY',
          activityId: input.activityId,
          attendanceId: newAttendance.id,
          // Sin clave para actividades que admiten registros múltiples: la
          // clave checkin:{activityId}:{studentId} identifica al PAR
          // (actividad, alumno), no a un escaneo puntual -- si la actividad
          // permite varios registros del mismo alumno, reusarla chocaría
          // contra la restricción única en el segundo escaneo LEGÍTIMO, no
          // solo en un reintento. Limitación conocida y deliberada: sin
          // allowMultipleCheckins (el caso real, RF-323 resuelto sin
          // actividades masivas) la protección de idempotencia sigue
          // exactamente como la documenta la skill motor-de-puntos.
          idempotencyKey: activity.allowMultipleCheckins ? undefined : idempotencyKey,
        });

        return { attendance: newAttendance, transaction: newTransaction };
      });
      attendance = result.attendance;
      transaction = result.transaction;
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'one_attendance_per_activity')) {
        const prior = await this.prisma.attendance.findFirst({
          where: { activityId: input.activityId, studentId: input.studentId, status: { not: 'REJECTED' } },
          include: { validatedBy: true, pointTransaction: true },
        });
        throw new AppException(409, 'ALREADY_CHECKED_IN', 'Este alumno ya fue registrado en esta actividad.', {
          checkedInAt: prior?.checkedInAt,
          pointsAwarded: prior?.pointTransaction?.points,
          validatedBy: prior?.validatedBy?.fullName,
        });
      }
      throw error;
    }

    // Paso 5: notificación DESPUÉS de confirmar -- nunca dentro de la tx.
    this.mail
      .enqueueCheckinNotification({
        to: student.email,
        fullName: student.fullName,
        activityTitle: activity.title,
        pointsAwarded: activity.pointsValue,
      })
      .catch((error: Error) => this.logger.warn(`No se pudo encolar la notificación de check-in: ${error.message}`));

    const updatedStudent = await this.prisma.studentProfile.findUniqueOrThrow({ where: { userId: input.studentId } });

    return {
      attendanceId: attendance.id,
      student: {
        id: student.id,
        fullName: student.fullName,
        studentCode: student.studentProfile.studentCode,
        avatarUrl: student.studentProfile.avatarUrl,
        career: student.studentProfile.career.name,
      },
      pointsAwarded: transaction.points,
      newTotal: updatedStudent.totalPoints,
      activity: { id: activity.id, title: activity.title },
      checkedInAt: attendance.checkedInAt.toISOString(),
    };
  }
}
