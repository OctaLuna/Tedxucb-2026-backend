import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import type { EnvConfig } from '../../config/env.validation';
import { MAIL_QUEUE } from './mail.constants';
import type { ApplicationConfirmationJob, CheckinNotificationJob, SelectionNotificationJob } from './mail.service';

/** Único lugar del proyecto que toca nodemailer -- el resto solo encola. */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    super();
    const user = this.config.get('SMTP_USER', { infer: true });
    const password = this.config.get('SMTP_PASSWORD', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: false,
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'application-confirmation') {
      await this.sendApplicationConfirmation(job.data as ApplicationConfirmationJob);
      return;
    }
    if (job.name === 'checkin-notification') {
      await this.sendCheckinNotification(job.data as CheckinNotificationJob);
      return;
    }
    if (job.name === 'selection-notification') {
      await this.sendSelectionNotification(job.data as SelectionNotificationJob);
      return;
    }
    this.logger.warn(`Job desconocido en la cola mail: ${job.name}`);
  }

  private async sendApplicationConfirmation(data: ApplicationConfirmationJob): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: data.to,
      subject: 'Recibimos tu postulación para TEDxUCB',
      text:
        `Hola ${data.fullName},\n\nRecibimos tu postulación para ser speaker de TEDxUCB. ` +
        'Nuestro equipo la va a revisar y te contactaremos con novedades.\n\nGracias por postular.',
    });
  }

  private async sendCheckinNotification(data: CheckinNotificationJob): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: data.to,
      subject: `Sumaste ${data.pointsAwarded} puntos en TEDxUCB`,
      text:
        `Hola ${data.fullName},\n\nRegistramos tu participación en "${data.activityTitle}" y ` +
        `sumamos ${data.pointsAwarded} puntos a tu perfil.\n\nRevisa tu progreso cuando quieras desde tu cuenta.`,
    });
  }

  private async sendSelectionNotification(data: SelectionNotificationJob): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: data.to,
      subject: 'Tienes un lugar confirmado en TEDxUCB',
      text:
        `Hola ${data.fullName},\n\nTu lugar en TEDxUCB quedó confirmado. Este es tu código de ` +
        `entrada, muéstralo en la puerta el día del evento:\n\n${data.entryCode}\n\nPuedes volver a ` +
        'consultarlo cuando quieras desde tu perfil.',
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job ${job.id} (${job.name}) falló tras ${job.attemptsMade} intento(s): ${error.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} (${job.name}) completado.`);
  }
}
