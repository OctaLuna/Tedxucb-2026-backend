import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicEventController } from './public-event.controller';
import { EventsController } from './events.controller';
import { ContentBlocksController } from './content-blocks.controller';
import { EventsService } from './events.service';
import { ContentBlocksService } from './content-blocks.service';

@Module({
  imports: [AuthModule],
  controllers: [PublicEventController, EventsController, ContentBlocksController],
  providers: [EventsService, ContentBlocksService],
})
export class ContentModule {}
