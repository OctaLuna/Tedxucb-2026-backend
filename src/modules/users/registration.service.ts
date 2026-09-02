import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { AppException } from '../../common/exceptions/app.exception';
import { PasswordHashingService } from '../auth/password-hashing.service';
import { OneTimeTokenService } from '../auth/one-time-token.service';
import { AuthTokenType, Role, UserStatus } from '../auth/auth.constants';
import { RegisterDto } from './dto/register.dto';

const INSTITUTIONAL_EMAIL_DOMAIN = '@ucb.edu.bo';

export interface RegisterResult {
  userId: string;
  status: string;
  email: string;
  message: string;
}

export interface VerifyEmailResult {
  userId: string;
  status: string;
  message: string;
}

/**
 * Historia 1 — el flujo de mayor riesgo de fraude del proyecto (Grupo 5 de
 * tasks.md). Aunque sus rutas viven bajo /auth/*, la lógica pertenece a
 * `users` porque crea el Usuario y su perfil de alumno; solo presta el
 * OneTimeTokenService genérico de `auth`.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashing: PasswordHashingService,
    private readonly oneTimeToken: OneTimeTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = normalizeEmail(dto.email);

    if (!email.endsWith(INSTITUTIONAL_EMAIL_DOMAIN)) {
      throw new AppException(
        422,
        'EMAIL_DOMAIN_NOT_ALLOWED',
        `El correo debe ser institucional (${INSTITUTIONAL_EMAIL_DOMAIN}).`,
      );
    }

    const career = await this.prisma.career.findUnique({ where: { id: dto.careerId } });
    if (!career) {
      throw new AppException(422, 'INVALID_CAREER', 'La carrera indicada no existe.');
    }

    const consentVersion = await this.prisma.consentVersion.findUnique({
      where: { id: dto.consentVersionId },
    });
    if (!consentVersion || !consentVersion.isActive) {
      const active = await this.prisma.consentVersion.findFirst({ where: { isActive: true } });
      throw new AppException(
        410,
        'CONSENT_VERSION_OUTDATED',
        'La versión de consentimiento cambió mientras completabas el formulario.',
        { currentVersionId: active?.id ?? null },
      );
    }

    // Verificación de unicidad *antes* de la transacción, para dar el
    // mensaje anti-enumeración correcto (email primero, luego código) sin
    // depender del orden en que Postgres reporte la violación.
    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new AppException(409, 'DUPLICATE_FIELD', 'Este correo ya está registrado.', {
        field: 'email',
      });
    }

    const existingCode = await this.prisma.studentProfile.findUnique({
      where: { studentCode: dto.studentCode },
    });
    if (existingCode) {
      throw new AppException(409, 'DUPLICATE_FIELD', 'Este código de registro ya está en uso.', {
        field: 'studentCode',
      });
    }

    const passwordHash = await this.passwordHashing.hash(dto.password);

    let userId = '';
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: dto.fullName,
            status: UserStatus.PENDING,
            registrationSource: 'SELF_REGISTRATION',
            roles: { create: [{ role: Role.ALUMNO }] },
          },
        });
        userId = user.id;

        await tx.studentProfile.create({
          data: {
            userId: user.id,
            studentCode: dto.studentCode,
            careerId: dto.careerId,
            academicPeriod: dto.academicPeriod,
            phone: dto.phone,
          },
        });

        await tx.consentAcceptance.create({
          data: { studentId: user.id, consentVersionId: dto.consentVersionId },
        });

        await tx.auditLog.create({
          data: { actorId: user.id, action: 'USER_REGISTERED', entityType: 'user', entityId: user.id },
        });

        // Mismo lugar que la restricción de unicidad de la base: si dos
        // registros concurrentes con el mismo correo/código llegan aquí a
        // la vez, uno de los dos choca contra el UNIQUE y la transacción
        // se revierte entera (Artículo IX: la garantía vive en el motor).
        await this.oneTimeToken.issue(
          { userId: user.id, type: AuthTokenType.EMAIL_VERIFICATION },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error,'users_email_key')) {
        throw new AppException(409, 'DUPLICATE_FIELD', 'Este correo ya está registrado.', {
          field: 'email',
        });
      }
      if (isUniqueConstraintViolation(error,'student_profiles_student_code_key')) {
        throw new AppException(409, 'DUPLICATE_FIELD', 'Este código de registro ya está en uso.', {
          field: 'studentCode',
        });
      }
      throw error;
    }

    // El envío del correo de verificación se encola después de confirmar
    // (fuera del alcance de este módulo: no hay mailer/cola todavía) --
    // nunca dentro de la transacción, para que un fallo del servicio de
    // correo no impida que la cuenta quede creada.

    return {
      userId,
      status: UserStatus.PENDING,
      email,
      message: 'Revisa tu correo institucional para verificar tu cuenta. El enlace vence en 7 días.',
    };
  }

  async verifyEmail(tokenPlain: string): Promise<VerifyEmailResult> {
    const record = await this.oneTimeToken.find(tokenPlain, AuthTokenType.EMAIL_VERIFICATION);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });

    if (record.consumedAt) {
      if (user.status === UserStatus.ACTIVE) {
        return {
          userId: user.id,
          status: user.status,
          message: 'Tu cuenta fue verificada. Ya puedes participar.',
        };
      }
      throw new AppException(
        409,
        'ACCOUNT_NOT_ELIGIBLE',
        'La cuenta ya no está en un estado verificable.',
      );
    }

    if (record.newEmail) {
      // Corrección de correo (RF-112a), no verificación de registro.
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.oneTimeToken.markConsumed(record.id, tx);
        const u = await tx.user.update({ where: { id: user.id }, data: { email: record.newEmail! } });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'EMAIL_CORRECTED', entityType: 'user', entityId: user.id },
        });
        return u;
      });
      return { userId: updated.id, status: updated.status, message: 'Tu correo fue actualizado.' };
    }

    if (user.status !== UserStatus.PENDING) {
      throw new AppException(
        409,
        'ACCOUNT_NOT_ELIGIBLE',
        'La cuenta ya no está en un estado verificable.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.oneTimeToken.markConsumed(record.id, tx);
      const u = await tx.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'EMAIL_VERIFIED', entityType: 'user', entityId: user.id },
      });
      return u;
    });

    return {
      userId: updated.id,
      status: updated.status,
      message: 'Tu cuenta fue verificada. Ya puedes participar.',
    };
  }
}
