import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { QstashSignatureGuard } from '../../common/qstash/qstash-signature.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';

/**
 * T092 (RF-332): job diario que SOLO alerta -- nunca corrige sola (la
 * corrección real es siempre `points-cli reconcile --fix`, con un
 * operador identificado en la auditoría). Reemplaza al
 * ReconciliationProcessor de BullMQ (`upsertJobScheduler`, cron
 * `0 3 * * *` America/La_Paz): en Vercel no hay proceso persistente que
 * sostenga ese scheduler, así que el disparo pasa a un *schedule* de
 * QStash (fuera del código, se crea una vez contra la API de QStash) que
 * llama a este endpoint. Nunca lo llama un cliente real, solo QStash con
 * firma válida.
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(QstashSignatureGuard)
export class ReconciliationCronController {
  private readonly logger = new Logger(ReconciliationCronController.name);

  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('reconciliation')
  async run(): Promise<{ discrepancies: number }> {
    const discrepancies = await this.reconciliation.checkAll();
    for (const discrepancy of discrepancies) {
      this.logger.error(
        `Discrepancia de reconciliación: alumno ${discrepancy.studentCode} -- ` +
          `caché ${discrepancy.cachedTotal}, ledger ${discrepancy.ledgerSum}.`,
      );
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'RECONCILIATION_DISCREPANCY_DETECTED',
          entityType: 'student_profile',
          entityId: discrepancy.studentId,
          detail: { cachedTotal: discrepancy.cachedTotal, ledgerSum: discrepancy.ledgerSum },
        },
      });
    }
    const eventDiscrepancies = await this.reconciliation.checkEventProjection();
    for (const discrepancy of eventDiscrepancies) {
      this.logger.error(
        `Discrepancia de saldo por evento: alumno ${discrepancy.studentId}, evento ${discrepancy.eventId} -- ` +
          `proyecciÃ³n ${discrepancy.cachedTotal}, ledger ${discrepancy.ledgerTotal}.`,
      );
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'EVENT_POINTS_PROJECTION_DISCREPANCY_DETECTED',
          entityType: 'event_student_points',
          detail: { eventId: discrepancy.eventId, studentId: discrepancy.studentId,
            cachedTotal: discrepancy.cachedTotal, ledgerTotal: discrepancy.ledgerTotal },
        },
      });
    }
    return { discrepancies: discrepancies.length + eventDiscrepancies.length };
  }
}
