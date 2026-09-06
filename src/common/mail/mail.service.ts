import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as QstashClient } from '@upstash/qstash';
import * as nodemailer from 'nodemailer';
import type { EnvConfig } from '../../config/env.validation';

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

export interface SelectionNotificationJob {
  to: string;
  fullName: string;
  entryCode: string;
}

export type MailJobName = 'application-confirmation' | 'checkin-notification' | 'selection-notification';
export type MailJobPayload = ApplicationConfirmationJob | CheckinNotificationJob | SelectionNotificationJob;

/**
 * Único lugar del proyecto que toca nodemailer. Antes el envío vivía en un
 * MailProcessor (@nestjs/bullmq, worker persistente) separado de este
 * servicio, que solo encolaba; se fusionaron porque un entorno serverless
 * (Vercel) no puede sostener un worker escuchando una cola indefinidamente.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly qstash?: QstashClient;
  private readonly publicUrl?: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    const user = this.config.get('SMTP_USER', { infer: true });
    const password = this.config.get('SMTP_PASSWORD', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: false,
      auth: user && password ? { user, pass: password } : undefined,
    });

    const qstashToken = this.config.get('QSTASH_TOKEN', { infer: true });
    this.publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    if (qstashToken && this.publicUrl) {
      this.qstash = new QstashClient({ token: qstashToken });
    }
  }

  /**
   * RF-213 / plan.md de 002: nunca envía de forma síncrona respecto al
   * llamador. El llamador debe invocarlo DESPUÉS de confirmar la escritura
   * en base de datos, nunca dentro de la misma transacción -- un fallo de
   * QStash/SMTP no puede impedir que la postulación quede registrada.
   */
  async enqueueApplicationConfirmation(job: ApplicationConfirmationJob): Promise<void> {
    await this.dispatch('application-confirmation', job);
  }

  /**
   * Mismo principio que la confirmación de postulación (skill
   * motor-de-puntos, paso 8 del check-in): se dispara DESPUÉS de confirmar
   * la transacción, nunca dentro -- una caída del servicio de correo no
   * puede impedir que el alumno reciba sus puntos.
   */
  async enqueueCheckinNotification(job: CheckinNotificationJob): Promise<void> {
    await this.dispatch('checkin-notification', job);
  }

  /** RF-410 (004): aviso al alumno seleccionado, con su entrada. Mismo principio: fuera de la transacción de selection.service.ts. */
  async enqueueSelectionNotification(job: SelectionNotificationJob): Promise<void> {
    await this.dispatch('selection-notification', job);
  }

  /**
   * En producción (QSTASH_TOKEN + PUBLIC_URL configurados) publica un
   * mensaje HTTP a QStash, que reintenta con backoff exponencial y llama
   * de vuelta a POST /internal/mail/send -- reemplaza al worker
   * persistente de BullMQ. En desarrollo/pruebas (sin QStash, contra
   * Mailpit local) se envía directo sin esperar la respuesta
   * bloquear ni fallar la petición que disparó el correo (se atrapa el
   * error, nunca se relanza) -- pero SÍ se espera (`await`, no
   * fire-and-forget): en un runtime serverless la función puede
   * congelarse apenas se envía la respuesta, y una promesa disparada sin
   * esperar podría no llegar a completarse nunca (bug real: la primera
   * versión de este método no esperaba, y en Vercel sin QStash
   * configurado el correo simplemente no se enviaba). En un servidor
   * tradicional (dev/pruebas) esperar no cambia nada observable.
   */
  private async dispatch(jobName: MailJobName, payload: MailJobPayload): Promise<void> {
    if (this.qstash && this.publicUrl) {
      await this.qstash.publishJSON({ url: `${this.publicUrl}/internal/mail/send`, body: { jobName, payload } });
      return;
    }

    try {
      await this.send(jobName, payload);
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo '${jobName}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Invocado directamente en local/pruebas, o desde el webhook de QStash en producción. */
  async send(jobName: MailJobName, payload: MailJobPayload): Promise<void> {
    switch (jobName) {
      case 'application-confirmation':
        return this.sendApplicationConfirmation(payload as ApplicationConfirmationJob);
      case 'checkin-notification':
        return this.sendCheckinNotification(payload as CheckinNotificationJob);
      case 'selection-notification':
        return this.sendSelectionNotification(payload as SelectionNotificationJob);
    }
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
}
