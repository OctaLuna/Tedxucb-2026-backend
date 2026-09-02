import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants';

export interface ApplicationConfirmationJob {
  to: string;
  fullName: string;
  applicationId: string;
}

export interface CheckinNotificationJob {
  to: string;
  fullName: string;
  activityTitle: string;
  pointsAwarded: number;
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

  /**
   * Mismo principio que la confirmación de postulación (skill
   * motor-de-puntos, paso 8 del check-in): se encola DESPUÉS de confirmar
   * la transacción, nunca dentro -- una caída del servicio de correo no
   * puede impedir que el alumno reciba sus puntos. Misma cola `mail`, no
   * una nueva: no hay razón de aislamiento real que justifique una segunda
   * cola (Artículo VII).
   */
  async enqueueCheckinNotification(job: CheckinNotificationJob): Promise<void> {
    await this.queue.add('checkin-notification', job);
  }
}
