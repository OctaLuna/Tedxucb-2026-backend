import { Injectable } from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { AppException } from '../../common/exceptions/app.exception';
import { OneTimeTokenService } from '../auth/one-time-token.service';
import { AuthTokenType, Role, UserStatus } from '../auth/auth.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  status: string;
  registrationSource: string;
  roles: string[];
  createdAt: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oneTimeToken: OneTimeTokenService,
  ) {}

  /** RF-104a — alta de staff/admin, nunca auto-registro. */
  async createUser(dto: CreateUserDto, actorId: string): Promise<UserSummary> {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppException(409, 'DUPLICATE_FIELD', 'Este correo ya está registrado.', {
        field: 'email',
      });
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          fullName: dto.fullName,
          status: UserStatus.INVITED,
          registrationSource: 'ADMIN_CREATED',
          createdById: actorId,
          roles: { create: dto.roles.map((role) => ({ role, grantedById: actorId })) },
        },
        include: { roles: true },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'USER_CREATED',
          entityType: 'user',
          entityId: created.id,
          detail: { roles: dto.roles },
        },
      });

      await this.oneTimeToken.issue(
        { userId: created.id, type: AuthTokenType.INVITATION, createdById: actorId },
        tx,
      );

      return created;
    });

    return this.toSummary(user);
  }

  /** Solo cuentas de staff/admin -- los alumnos se listan en `profiles` (GET /students). */
  async listUsers(page: number, limit: number): Promise<PaginatedResult<UserSummary>> {
    const where = { roles: { some: { role: { in: [Role.ADMIN, Role.STAFF] } } } };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { roles: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((u) => this.toSummary(u)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getUser(id: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!user) {
      throw new AppException(404, 'NOT_FOUND', 'Usuario no encontrado.');
    }
    return this.toSummary(user);
  }

  async updateUser(id: string, dto: UpdateUserDto, actorId: string): Promise<UserSummary> {
    await this.getUser(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { fullName: dto.fullName },
      include: { roles: true },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'USER_UPDATED', entityType: 'user', entityId: id, detail: { ...dto } },
    });
    return this.toSummary(user);
  }

  /** RF-103, RF-118. RF-119 (nunca sin admin activo) lo garantiza el trigger de la migración. */
  async disableUser(id: string, actorId: string): Promise<UserSummary> {
    const user = await this.updateStatusOrMapLastAdmin(id, UserStatus.DISABLED);
    await this.prisma.auditLog.create({
      data: { actorId, action: 'USER_DISABLED', entityType: 'user', entityId: id },
    });
    return this.toSummary(user);
  }

  async enableUser(id: string, actorId: string): Promise<UserSummary> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE },
      include: { roles: true },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'USER_ENABLED', entityType: 'user', entityId: id },
    });
    return this.toSummary(user);
  }

  async grantRole(id: string, role: Role, actorId: string): Promise<UserSummary> {
    await this.getUser(id);
    await this.prisma.userRole.upsert({
      where: { userId_role: { userId: id, role } },
      create: { userId: id, role, grantedById: actorId },
      update: {},
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'ROLE_GRANTED', entityType: 'user', entityId: id, detail: { role } },
    });
    return this.getUser(id);
  }

  /** RF-119 (nunca sin admin activo) lo garantiza el trigger no_remove_last_admin_role. */
  async revokeRole(id: string, role: Role, actorId: string): Promise<UserSummary> {
    try {
      await this.prisma.userRole.delete({ where: { userId_role: { userId: id, role } } });
    } catch (error) {
      this.throwIfLastAdmin(error);
      throw error;
    }
    await this.prisma.auditLog.create({
      data: { actorId, action: 'ROLE_REVOKED', entityType: 'user', entityId: id, detail: { role } },
    });
    return this.getUser(id);
  }

  /** CE-107: cuentas pendientes hace más de 7 días deben ser visibles aquí. */
  async listPendingStudents(page: number, limit: number): Promise<PaginatedResult<UserSummary>> {
    const where = { status: UserStatus.PENDING, registrationSource: 'SELF_REGISTRATION' };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { roles: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: rows.map((u) => this.toSummary(u)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Revisión manual (ADR-007, RF-126): aprobar activa la cuenta igual que
   * la verificación de correo — ambas son barreras equivalentes, ninguna
   * obligatoria por sí sola (no existe padrón; el criterio humano del admin
   * es tan válido como el enlace de correo).
   */
  async approveStudent(id: string, actorId: string): Promise<UserSummary> {
    const user = await this.requirePendingReview(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
        include: { roles: true },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'REGISTRATION_APPROVED', entityType: 'user', entityId: id },
      });
      return u;
    });
    return this.toSummary(updated);
  }

  async rejectStudent(id: string, reason: string, actorId: string): Promise<UserSummary> {
    const user = await this.requirePendingReview(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { status: UserStatus.REJECTED },
        include: { roles: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'REGISTRATION_REJECTED',
          entityType: 'user',
          entityId: id,
          detail: { reason },
        },
      });
      return u;
    });
    return this.toSummary(updated);
  }

  async getAuditLog(
    page: number,
    limit: number,
    entityType?: string,
    actorId?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const where: Record<string, unknown> = {};
    if (entityType) where.entityType = entityType;
    if (actorId) where.actorId = actorId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  private async requirePendingReview(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.status !== UserStatus.PENDING) {
      throw new AppException(
        409,
        'NOT_PENDING_REVIEW',
        'Esta cuenta no está pendiente de revisión.',
      );
    }
    return user;
  }

  private async updateStatusOrMapLastAdmin(id: string, status: string): Promise<User & { roles: UserRole[] }> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { status },
        include: { roles: true },
      });
    } catch (error) {
      this.throwIfLastAdmin(error);
      throw error;
    }
  }

  private throwIfLastAdmin(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('RF-119')) {
      throw new AppException(
        409,
        'LAST_ADMIN_STANDING',
        'El sistema quedaría sin ningún administrador activo.',
      );
    }
  }

  private toSummary(user: User & { roles: UserRole[] }): UserSummary {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      registrationSource: user.registrationSource,
      roles: user.roles.map((r) => r.role),
      createdAt: user.createdAt,
    };
  }
}
