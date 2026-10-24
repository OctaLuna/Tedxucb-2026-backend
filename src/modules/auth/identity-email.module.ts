import { Module } from '@nestjs/common';
import { MailModule } from '../../common/mail/mail.module';
import { EventAccessModule } from '../event-access/event-access.module';
import { AuthModule } from './auth.module';
import { IdentityEmailController } from './identity-email.controller';
import { IdentityEmailService } from './identity-email.service';

@Module({
  imports: [AuthModule, EventAccessModule, MailModule],
  controllers: [IdentityEmailController],
  providers: [IdentityEmailService],
})
export class IdentityEmailModule {}
