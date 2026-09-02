import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants';

export interface ApplicationConfirmationJob {
  to: string;
  fullName: string;
  applicationId: string;
}

@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue) {}

  /**
   * RF-213 / plan.md de 002: nunca envía de forma síncrona. El llamador
   * debe invocarlo DESPUÉS de confirmar la escritura en base de datos,
   * nunca dentro de la misma transacción -- un fallo de Redis/SMTP no
   * puede impedir que la postulación quede registrada.
   */
  async enqueueApplicationConfirmation(job: ApplicationConfirmationJob): Promise<void> {
    await this.queue.add('application-confirmation', job);
  }
}
