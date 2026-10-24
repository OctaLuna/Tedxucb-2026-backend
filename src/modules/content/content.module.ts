import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../../common/upload/upload.module';
import { PublicEventController } from './public-event.controller';
import { EventsController } from './events.controller';
import { ContentBlocksController } from './content-blocks.controller';
import { EventsService } from './events.service';
import { ContentBlocksService } from './content-blocks.service';
import { EventAccessModule } from '../event-access/event-access.module';
import { EventProgramController, PublicEventProgramController } from './event-program.controller';
import { EventProgramService } from './event-program.service';
import { EventLiveController, PublicEventLiveController } from './event-live.controller';
import { EventLiveService } from './event-live.service';

@Module({
  imports: [AuthModule, UploadModule, EventAccessModule],
  controllers: [PublicEventController, EventsController, ContentBlocksController, EventProgramController, PublicEventProgramController, EventLiveController, PublicEventLiveController],
  providers: [EventsService, ContentBlocksService, EventProgramService, EventLiveService],
})
export class ContentModule {}
