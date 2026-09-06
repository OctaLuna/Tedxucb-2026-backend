import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { QstashSignatureGuard } from '../qstash/qstash-signature.guard';
import { MailService } from './mail.service';
import type { MailJobName, MailJobPayload } from './mail.service';

interface MailWebhookBody {
  jobName: MailJobName;
  payload: MailJobPayload;
}

/**
 * Endpoint interno que QStash llama de vuelta para efectivamente enviar un
 * correo (ver MailService.dispatch) -- reemplaza al MailProcessor de
 * BullMQ. Nunca lo llama un cliente real, solo QStash con firma válida
 * (QstashSignatureGuard); excluido de Swagger a propósito.
 */
@ApiExcludeController()
@Controller('internal/mail')
@UseGuards(QstashSignatureGuard)
export class MailWebhookController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  async send(@Body() body: MailWebhookBody): Promise<void> {
    await this.mailService.send(body.jobName, body.payload);
  }
}
