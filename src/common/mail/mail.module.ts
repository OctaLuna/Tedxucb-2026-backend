import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailWebhookController } from './mail-webhook.controller';

@Module({
  controllers: [MailWebhookController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
