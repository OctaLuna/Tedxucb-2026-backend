import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../../common/mail/mail.module';
import { PublicSpeakersController } from './public-speakers.controller';
import { SpeakersController } from './speakers.controller';
import { PublicApplicationsController } from './public-applications.controller';
import { ApplicationsController } from './applications.controller';
import { SpeakersService } from './speakers.service';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [PublicSpeakersController, SpeakersController, PublicApplicationsController, ApplicationsController],
  providers: [SpeakersService, ApplicationsService],
})
export class SpeakersModule {}
