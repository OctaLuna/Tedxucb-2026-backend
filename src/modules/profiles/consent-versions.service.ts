import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { CreateConsentVersionDto } from './dto/create-consent-version.dto';

@Injectable()
export class ConsentVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.consentVersion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** RF-128: crea una versión nueva y desactiva la anterior en la misma transacción. */
  async create(dto: CreateConsentVersionDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.consentVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.consentVersion.create({
        data: { version: dto.version, body: dto.body, isActive: true, createdById: actorId },
      });
    });
  }

  async getActive() {
    const active = await this.prisma.consentVersion.findFirst({ where: { isActive: true } });
    if (!active) {
      throw new AppException(
        404,
        'NO_ACTIVE_CONSENT_VERSION',
        'No hay una versión de consentimiento activa configurada.',
      );
    }
    return { id: active.id, version: active.version, body: active.body };
  }
}
