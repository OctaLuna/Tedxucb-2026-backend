import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import { UploadService } from '../../common/upload/upload.service';
import { UserStatus } from '../auth/auth.constants';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface UploadedAvatarFile {
  buffer: Buffer;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
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
   * Validación real del archivo (tipo por bytes, no mimetype del cliente)
   * y subida a Vercel Blob viven en UploadService, compartido con
   * content/events y speakers -- un archivo inválido no debe alterar el
   * avatar existente, por eso updateAvatar solo toca la fila si upload()
   * no lanzó.
   */
  async updateAvatar(userId: string, file: UploadedAvatarFile | undefined): Promise<{ avatarUrl: string }> {
    const avatarUrl = await this.uploadService.upload('avatars', file?.buffer);
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
