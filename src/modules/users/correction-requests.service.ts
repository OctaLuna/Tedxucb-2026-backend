import { Injectable } from '@nestjs/common';
import type { CorrectionRequest } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { OneTimeTokenService } from '../auth/one-time-token.service';
import { AuthTokenType } from '../auth/auth.constants';
import { CreateCorrectionRequestDto } from './dto/create-correction-request.dto';
import { ResolveCorrectionRequestDto } from './dto/resolve-correction-request.dto';
import type { PaginatedResult } from './users.service';

/**
 * RF-112a: el alumno solicita corregir un campo bloqueado (`studentCode`,
 * `careerId`, `email`). El admin resuelve. `email` nunca se sobrescribe
 * directo: dispara un `auth_tokens` con `new_email` y el cambio real ocurre
 * cuando el alumno verifica el nuevo correo (ver `RegistrationService.verifyEmail`).
 */
@Injectable()
export class CorrectionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oneTimeToken: OneTimeTokenService,
  ) {}

  async create(studentId: string, dto: CreateCorrectionRequestDto): Promise<CorrectionRequest> {
    try {
      return await this.prisma.correctionRequest.create({
        data: { studentId, field: dto.field, newValue: dto.newValue, reason: dto.reason },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('one_pending_correction_per_student_field')) {
        throw new AppException(
          409,
          'CORRECTION_ALREADY_PENDING',
          `Ya existe una solicitud pendiente para el campo "${dto.field}".`,
        );
      }
      throw error;
    }
  }

  async list(page: number, limit: number, status?: string): Promise<PaginatedResult<CorrectionRequest>> {
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.correctionRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.correctionRequest.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  async resolve(
    id: string,
    dto: ResolveCorrectionRequestDto,
    actorId: string,
  ): Promise<CorrectionRequest> {
    const request = await this.prisma.correctionRequest.findUnique({ where: { id } });
    if (!request || request.status !== 'PENDING') {
      throw new AppException(409, 'NOT_PENDING_REVIEW', 'Esta solicitud ya fue resuelta.');
    }

    if (!dto.approve) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.correctionRequest.update({
          where: { id },
          data: {
            status: 'REJECTED',
            resolvedById: actorId,
            resolvedAt: new Date(),
            resolutionNote: dto.note,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'CORRECTION_REQUEST_REJECTED',
            entityType: 'correction_request',
            entityId: id,
          },
        });
        return u;
      });
      return updated;
    }

    if (request.field === 'email') {
      // No sobrescribe users.email directo: crea el token de verificación
      // con new_email, el cambio real ocurre cuando el alumno lo consume.
      await this.oneTimeToken.issue({
        userId: request.studentId,
        type: AuthTokenType.EMAIL_VERIFICATION,
        newEmail: request.newValue,
      });

      return this.prisma.$transaction(async (tx) => {
        const u = await tx.correctionRequest.update({
          where: { id },
          data: {
            status: 'RESOLVED',
            resolvedById: actorId,
            resolvedAt: new Date(),
            resolutionNote: dto.note,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'CORRECTION_REQUEST_RESOLVED',
            entityType: 'correction_request',
            entityId: id,
            detail: { field: 'email' },
          },
        });
        return u;
      });
    }

    // studentCode / careerId: internos del sistema, no un identificador de
    // acceso -- se aplican de inmediato, sin re-verificación.
    const data = request.field === 'studentCode'
      ? { studentCode: request.newValue }
      : { careerId: request.newValue };

    return this.prisma.$transaction(async (tx) => {
      await tx.studentProfile.update({ where: { userId: request.studentId }, data });
      const u = await tx.correctionRequest.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedById: actorId,
          resolvedAt: new Date(),
          resolutionNote: dto.note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'CORRECTION_REQUEST_RESOLVED',
          entityType: 'correction_request',
          entityId: id,
          detail: { field: request.field },
        },
      });
      return u;
    });
  }
}
