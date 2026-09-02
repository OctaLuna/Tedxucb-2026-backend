import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { POINTS_RECONCILIATION_QUEUE, DAILY_RECONCILIATION_JOB_ID } from './points.constants';

/**
 * T092 (RF-332): job diario que SOLO alerta -- nunca corrige sola. RF-332
 * (verificar y alertar) y RF-333 (permitir recalcular) son operaciones
 * deliberadamente distintas: la corrección real es siempre `points-cli
 * reconcile --fix`, con un operador identificado en la auditoría. Hora
 * fuera de horario elegida por no haber un RF que fije una exacta.
 */
@Injectable()
@Processor(POINTS_RECONCILIATION_QUEUE)
export class ReconciliationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    @InjectQueue(POINTS_RECONCILIATION_QUEUE) private readonly queue: Queue,
    private readonly reconciliation: ReconciliationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // upsertJobScheduler (BullMQ 6, reemplaza add(..., {repeat})) es
    // idempotente por su jobSchedulerId: reinicios y arranques repetidos de
    // la app (incluida la suite de pruebas, que levanta la app una vez por
    // archivo) actualizan el mismo scheduler en vez de acumular duplicados.
    await this.queue.upsertJobScheduler(
      DAILY_RECONCILIATION_JOB_ID,
      { pattern: '0 3 * * *', tz: 'America/La_Paz' },
      { name: 'daily-reconciliation' },
    );
  }

  async process(_job: Job): Promise<void> {
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
  }
}
