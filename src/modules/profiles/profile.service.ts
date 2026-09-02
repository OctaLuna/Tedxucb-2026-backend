import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { UserStatus } from '../auth/auth.constants';
import type { EnvConfig } from '../../config/env.validation';
import { ALLOWED_AVATAR_MIME_TYPES } from './profiles.constants';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface UploadedAvatarFile {
  buffer: Buffer;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: true, career: { include: { faculty: true } } },
    });
    if (!profile) {
      throw new AppException(404, 'NOT_FOUND', 'Perfil no encontrado.');
    }
    return this.toResponse(profile);
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // RF-112: bloqueado una vez ACTIVE. Mientras PENDING, se corrige libre
    // (ver data-model.md: el bloqueo se deriva de users.status, no es columna).
    if (user.status === UserStatus.ACTIVE) {
      if (dto.studentCode !== undefined) {
        throw new AppException(403, 'FIELD_LOCKED', 'El código de registro ya no se puede editar.', {
          field: 'studentCode',
        });
      }
      if (dto.careerId !== undefined) {
        throw new AppException(403, 'FIELD_LOCKED', 'La carrera ya no se puede editar.', {
          field: 'careerId',
        });
      }
    }

    const data: Record<string, unknown> = {
      bio: dto.bio,
      interests: dto.interests,
      accessibilityNeeds: dto.accessibilityNeeds,
      professionalLink: dto.professionalLink,
      phone: dto.phone,
    };

    if (user.status !== UserStatus.ACTIVE) {
      if (dto.careerId !== undefined) {
        const career = await this.prisma.career.findUnique({ where: { id: dto.careerId } });
        if (!career) {
          throw new AppException(422, 'INVALID_CAREER', 'La carrera indicada no existe.');
        }
        data.careerId = dto.careerId;
      }
      if (dto.studentCode !== undefined) {
        const existing = await this.prisma.studentProfile.findUnique({
          where: { studentCode: dto.studentCode },
        });
        if (existing && existing.userId !== userId) {
          throw new AppException(409, 'DUPLICATE_FIELD', 'Este código de registro ya está en uso.', {
            field: 'studentCode',
          });
        }
        data.studentCode = dto.studentCode;
      }
    }

    try {
      const updated = await this.prisma.studentProfile.update({
        where: { userId },
        data,
        include: { user: true, career: { include: { faculty: true } } },
      });
      return this.toResponse(updated);
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'student_profiles_student_code_key')) {
        throw new AppException(409, 'DUPLICATE_FIELD', 'Este código de registro ya está en uso.', {
          field: 'studentCode',
        });
      }
      throw error;
    }
  }

  /**
   * Valida el tipo REAL del archivo con file-type (nunca el mimetype que
   * manda el cliente) antes de escribir a disco. Un archivo inválido no
   * debe alterar el avatar existente -- por eso toda la validación ocurre
   * antes de tocar la fila en la base o el disco.
   */
  async updateAvatar(userId: string, file: UploadedAvatarFile | undefined): Promise<{ avatarUrl: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new AppException(422, 'INVALID_IMAGE', 'No se recibió ningún archivo.');
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_AVATAR_MIME_TYPES.has(detected.mime)) {
      throw new AppException(
        422,
        'INVALID_IMAGE',
        'El archivo no es una imagen válida en un formato admitido.',
      );
    }

    const uploadDir = path.resolve(this.config.get('AVATAR_UPLOAD_DIR', { infer: true }));
    await mkdir(uploadDir, { recursive: true });

    // Nunca el nombre original (skill seguridad-y-roles): UUID + extensión
    // real detectada por file-type, no la del archivo subido.
    const filename = `${randomUUID()}.${detected.ext}`;
    await writeFile(path.join(uploadDir, filename), file.buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;
    await this.prisma.studentProfile.update({ where: { userId }, data: { avatarUrl } });

    return { avatarUrl };
  }

  private toResponse(
    profile: {
      userId: string;
      studentCode: string;
      careerId: string;
      academicPeriod: string;
      phone: string;
      avatarUrl: string | null;
      idDocumentUrl: string | null;
      bio: string | null;
      interests: string[];
      accessibilityNeeds: string | null;
      professionalLink: string | null;
      user: { fullName: string; email: string; status: string };
      career: { name: string; faculty: { name: string } };
    },
  ) {
    return {
      userId: profile.userId,
      fullName: profile.user.fullName,
      email: profile.user.email,
      status: profile.user.status,
      studentCode: profile.studentCode,
      career: profile.career.name,
      faculty: profile.career.faculty.name,
      academicPeriod: profile.academicPeriod,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
      idDocumentUrl: profile.idDocumentUrl,
      bio: profile.bio,
      interests: profile.interests,
      accessibilityNeeds: profile.accessibilityNeeds,
      professionalLink: profile.professionalLink,
    };
  }
}
